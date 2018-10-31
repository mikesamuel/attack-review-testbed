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
 * Displays recent posts visible to the current user.
 */

// SENSITIVE - Trusted to unbox personally identifying information about users.

require('module-keys/cjs').polyfill(module, require);

const { URL } = require('url');
const template = require('./account.pug');
const safesql = require('safesql');

// eslint-disable-next-line no-magic-numbers
const STATUS_TEMPORARY_REDIRECT = 302;

function trimOrNull(str) {
  return (str && str.replace(/^\s+|\s+$/g, '')) || null;
}

exports.handle = (bundle, handleError) => {
  const { res, req, reqUrl, database, currentAccount } = bundle;

  // Logout before logging in
  if (!currentAccount) {
    res.statusCode = STATUS_TEMPORARY_REDIRECT;
    // Use continue to bounce back here after logging out.
    const dest = new URL(`/login?cont=${ encodeURIComponent(reqUrl.pathname + reqUrl.search) }`, reqUrl);
    res.setHeader('Location', dest.href);
    res.end();
    return;
  }

  let params = null;
  let isPost = false;
  switch (req.method) {
    case 'GET':
    case 'HEAD':
      params = {};
      for (const key of reqUrl.searchParams.keys()) {
        params[key] = reqUrl.searchParams.get(key);
      }
      break;
    case 'POST':
      isPost = true;
      params = req.body;
      break;
    default:
      handleError(new Error(req.method));
      return;
  }

  const cont = (params.cont && params.cont[0]) || req.headers.referer || '/';
  if (isPost) {
    commitThenRedirect(); // eslint-disable-line no-use-before-define
  } else {
    serveForm(); // eslint-disable-line no-use-before-define
  }

  function commitThenRedirect() {
    let contUrl = new URL(cont, reqUrl);
    if (contUrl.origin === reqUrl.origin) {
      contUrl = new URL('/', reqUrl);
    }

    const { aid } = currentAccount;
    const displayNameIsHtml = Boolean(params.displayNameIsHtml);
    const displayNameText = trimOrNull(params.displayName);
    const displayname = displayNameIsHtml ? null : displayNameText;
    const displaynamehtml = displayNameIsHtml ? displayNameText : null;
    const publicurl = trimOrNull(params.publicUrl);
    const realname = trimOrNull(params.realName);
    const email = trimOrNull(params.email);

    database.connect().then(
      (client) => {
        function releaseAndReject(exc) {
          client.release();
          handleError(exc);
        }

        function success() {
          client.release();
          res.statusCode = STATUS_TEMPORARY_REDIRECT;
          res.setHeader('Location', contUrl.href);
          res.end();
        }

        function commitAccountChanges() {
          const sql = safesql.pg`
            UPDATE Accounts
              SET   displayname=${ displayname },
                    displaynamehtml=${ displaynamehtml },
                    publicurl=${ publicurl }
              WHERE aid=${ aid };

            UPDATE PersonalInfo
              SET   realname=${ realname },
                    email=${ email }
              WHERE aid=${ aid };`;
          client.query(sql).then(
            success,
            releaseAndReject);
        }

        commitAccountChanges();
      },
      handleError);
  }

  function serveForm() {
    res.statusCode = 200;
    res.end(template(Object.assign(
      {},
      bundle,
      {
        cont,
        unbox(box) {
          return require.keys.unbox(box, () => true);
        },
      })));
  }
};
