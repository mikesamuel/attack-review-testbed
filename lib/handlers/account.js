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

  let paramsPromise = Promise.resolve(reqUrl.searchParams);
  let isPost = false;
  switch (req.method) {
    case 'GET':
    case 'HEAD':
      break;
    case 'POST':
      isPost = true;
      paramsPromise = new Promise((resolve, reject) => {
        let body = '';
        req.on('data', (chunk) => (body += chunk.toString()));
        req.on('end', () => {
          const url = new URL(`http://example.com/?${ body }`);
          resolve(url.searchParams);
        });
        req.on('error', reject);
      });
      break;
    default:
      paramsPromise = Promise.reject(new Error(req.method));
      break;
  }

  paramsPromise.then(
    (params) => {
      const cont = params.get('cont') || req.headers.referer || '/';
      if (isPost) {
        let contUrl = new URL(cont, reqUrl);
        if (contUrl.origin === reqUrl.origin) {
          contUrl = new URL('/', reqUrl);
        }

        const { aid } = currentAccount;
        const displayNameIsHtml = params.get('displayNameIsHtml');
        const displayNameText = trimOrNull(params.get('displayName'));
        const displayname = displayNameIsHtml ? null : displayNameText;
        const displaynamehtml = displayNameIsHtml ? displayNameText : null;
        const publicurl = trimOrNull(params.get('publicUrl'));
        const realname = trimOrNull(params.get('realName'));
        const email = trimOrNull(params.get('email'));

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
      } else {
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
    },
    handleError);
};
