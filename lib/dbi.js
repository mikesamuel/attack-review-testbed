/**
 * @license
 * Copyright 2018 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

/**
 * @fileoverview
 * Database interface that guards against accidental leaks.
 */

require('module-keys/cjs').polyfill(module, require);

const { box, isPublicKey } = require.keys;

const safesql = require('safesql');

const sessionTimeoutMs = safesql.pg`(interval '1 hour')`;
const linkify = require('./poorly-written-linkifier.js');
const { sanitize } = require('./safe/html.js');
const { publicKey: accountPubKey } = require('../lib/handlers/account.js');

const defaultLimit = 10; // eslint-disable-line no-magic-numbers

/**
 * True when the principal identified by the given public key
 * may read publicly identifying information?
 */
function mayReadPii(readerPubKey) { // eslint-disable-line no-unused-vars
  return isPublicKey(readerPubKey) && readerPubKey() && readerPubKey === accountPubKey;
}

function fallbackToPlainText(plainText, untrustedHtml, fallback) {
  return (untrustedHtml ? sanitize(untrustedHtml) : plainText) || fallback;
}

/**
 * { aid, displayName, realName, email } for the user associated with the given session nonce.
 * Silently creates a session nonce relationship for the unlogged-in-user if no entry.
 */
function getCurrentAccount(database, sessionNonce) {
  return new Promise(
    (resolve, reject) => {
      database.connect().then(
        (client) => {
          client.query(
            safesql.pg`
-- Remove any timed out sessions
DELETE FROM Sessions WHERE sessionnonce=${ sessionNonce } AND created < (NOW() - ${ sessionTimeoutMs });

-- Create a session entry if none, otherwise reset timeout countdown.
INSERT INTO Sessions (sessionnonce, aid)
  VALUES             (${ sessionNonce }, NULL)
  ON CONFLICT (sessionnonce) DO UPDATE SET created=NOW();

-- Get the user info we need.
SELECT Sessions.aid, Accounts.displayname, Accounts.displaynamehtml, Accounts.publicurl,
       PersonalInfo.realname, PersonalInfo.email
  FROM      Sessions
  LEFT JOIN Accounts     ON Sessions.aid = Accounts.aid
  LEFT JOIN PersonalInfo ON Sessions.aid = PersonalInfo.aid
  WHERE Sessions.sessionnonce = ${ sessionNonce }
`)
            .then(
              (resultSet) => {
                client.release();

                let aid = null;
                let displayname = null;
                let displaynamehtml = null;
                let publicurl = null;
                let realname = null;
                let email = null;
                try {
                  ([ , , { rows: [ { aid, displayname, displaynamehtml, publicurl, realname, email } ] } ] = resultSet);
                } catch (exc) {
                  reject(exc);
                  return;
                }
                if (aid === null) {
                  resolve(null);
                } else {
                  resolve({
                    aid,
                    displayName: fallbackToPlainText(displayname, displaynamehtml, 'Anonymous'),
                    publicUrl: publicurl,
                    realName: box(realname, mayReadPii),
                    email: box(email, mayReadPii),
                  });
                }
              },
              (exc) => {
                client.release();
                reject(exc);
              });
        },
        reject);
    });
}

function getPosts(database, aid, { limit, offset } = {}) {
  function fetchPostsSql() {
    // The NULL author authors nothing even if we end up with NULLs
    // in the author column perhaps due to some mistake by a dbadmin.
    const isAuthor = aid ? safesql.pg`Posts.author = ${ aid }` : safesql.pg`FALSE`;

    // Intentionally large attack surface.
    // This code is not only relying on access control checks in SQL, but SQL that
    // has attacker controlled strings inserted since the sessionNonce is part of the
    // HTTP request, and limit and offset are directly controllable via parameters.
    const selectPostFields = safesql.pg`
SELECT Posts.pid, Posts.author, Posts.bodyhtml, Posts.created,
       Accounts.displayname AS authorname, Accounts.displaynamehtml AS authornamehtml,
       Accounts.publicurl AS authorurl
  FROM       Posts`;

    return safesql.pg`
(
-- First select the public and owned ones
${ selectPostFields }
  LEFT JOIN  Accounts              ON Posts.author = Accounts.aid
  WHERE Posts.public OR (${ isAuthor })
UNION
-- Then select friends posts.
${ selectPostFields }
  LEFT JOIN  Accounts              ON Posts.author = Accounts.aid
  LEFT JOIN  Friendships AS FLeft  ON Posts.author = FLeft.leftaid
  LEFT JOIN  Friendships AS FRight ON Posts.author = FRight.rightaid
  WHERE NOT (Posts.public OR ${ isAuthor })
        AND (FLeft.rightaid  = ${ aid } AND FRight.leftaid = ${ aid })
) ORDER BY created ASC
  LIMIT  ${ limit || defaultLimit }
  OFFSET ${ offset || 0 };

`;
  }

  function collectPosts(rows) {
    const posts = [];
    for (const { pid, author, authorname, authornamehtml, authorurl, bodyhtml, created } of rows) {
      posts.push({
        pid, author, created,
        authorName: fallbackToPlainText(authorname, authornamehtml),
        authorUrl: authorurl,
        body: sanitize(linkify(bodyhtml)),
        // Filled in later.
        images: [],
      });
    }
    return posts;
  }

  function fetchImagesSql(posts) {
    const pids = [];
    const pidToPost = new Map();
    for (const post of posts) {
      const { pid } = post;
      pids.push(pid);
      pidToPost.set(pid, post);
    }
    return {
      sql: safesql.pg`SELECT pid, urlpath FROM PostResources WHERE pid IN ( ${ pids } ) ORDER BY rid;`,
      pidToPost,
    };
  }

  function collateImagesAndPosts(pidToPost, rows) {
    for (const { pid, urlpath } of rows) {
      pidToPost.get(pid).images.push(urlpath);
    }
  }

  return new Promise((resolve, reject) => {
    database.connect().then(
      (client) => {
        function releaseAndReject(exc) {
          client.release();
          reject(exc);
        }
        client.query(fetchPostsSql()).then(
          (postResults) => {
            let posts = null;
            try {
              posts = collectPosts(postResults.rows);
            } catch (exc) {
              releaseAndReject(exc);
              return;
            }
            const { sql: fetchSql, pidToPost } = fetchImagesSql(posts);
            client.query(fetchSql).then(
              (imageResults) => {
                client.release();
                try {
                  collateImagesAndPosts(pidToPost, imageResults.rows);
                } catch (exc) {
                  releaseAndReject(exc);
                  return;
                }
                resolve(posts);
              },
              releaseAndReject);
          },
          releaseAndReject);
      },
      reject);
  });
}

module.exports = {
  getCurrentAccount,
  getPosts,
};
