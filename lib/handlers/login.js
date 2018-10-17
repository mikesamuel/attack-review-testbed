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
 * Associates the current session with an account.
 */

const { URL } = require('url');

const safesql = require('safesql');
const bodyParser = require('body-parser');

const template = require('./login.pug');

const postdataParser = bodyParser.urlencoded({ extended: false });

// eslint-disable-next-line no-magic-numbers
const STATUS_TEMPORARY_REDIRECT = 302;

exports.handle = (bundle) => {
  const { res, req, reqUrl, database, handleError, currentAccount, sessionNonce } = bundle;

  // Logout before logging in
  if (currentAccount && currentAccount.aid !== null) {
    res.statusCode = STATUS_TEMPORARY_REDIRECT;
    // Use continue to bounce back here after logging out.
    const dest = new URL(`/logout?cont=${ encodeURIComponent(reqUrl.pathname + reqUrl.search) }`, reqUrl);
    res.setHeader('Location', dest.href);
    res.end();
    return;
  }

  // The URL we continue to on successful login.
  // We thread this through from one form to another via a hidden input.
  function getDestinationUrl(cont) {
    const defaultDest = new URL('/account', reqUrl);
    const dest = new URL(cont || req.headers.referer || defaultDest.pathname, defaultDest);
    if (dest.origin === reqUrl.origin) {
      // No open redirector.
      return dest;
    }
    return defaultDest;
  }

  let formPromise = null;
  if (req.method === 'POST') {
    formPromise = new Promise((resolve, reject) => {
      postdataParser(req, res, (exc) => {
        if (exc) {
          reject(exc);
        } else {
          const { cont, email } = req.body;
          resolve({
            cont,
            email,
            submitted: true,
          });
        }
      });
    });
  } else {
    formPromise = Promise.resolve({
      cont: reqUrl.searchParams.get('cont'),
      email: null,
      submitted: false,
    });
  }

  formPromise.then(
    ({ email, cont, submitted }) => {
      const contUrl = getDestinationUrl(cont);
      let loginPromise = Promise.resolve(null);
      if (submitted && typeof email === 'string') {
        email = email.replace(/^\s+|\s+$/g, '');

        if (email) {
          loginPromise = new Promise((resolve, reject) => {
            database.connect().then(
              (client) => {
                // Release the client if anything goes wrong.
                function releaseAndReject(exc) {
                  client.release();
                  reject(exc);
                }
                // If there's no account id associated with the given email, we need to create an
                // account record, before updating the PersonalInfo table with the email.
                function createNewAccount() {
                  client.query(safesql.pg`INSERT INTO Accounts DEFAULT VALUES RETURNING *`).then(
                    (resultSet) => {
                      const [ { aid } ] = resultSet.rows;
                      client.query(safesql.pg`INSERT INTO PersonalInfo (aid, email) VALUES (${ aid }, ${ email })`)
                        .then(
                          () => {
                            // eslint-disable-next-line no-use-before-define
                            associateAccountWithSessionNonce(resultSet);
                          },
                          releaseAndReject);
                    },
                    releaseAndReject);
                }
                // Once we've got an aid we can associate it with the sessionNonce in the Sessions
                // table.  There must be a row there because this handler wouldn't have been reached
                // except after fetching the current account which creates an entry in Sessions if
                // none exists for the sessionNonce.
                function associateAccountWithSessionNonce(resultSet) {
                  if (resultSet.rowCount === 1) {
                    const [ { aid } ] = resultSet.rows;
                    client.query(safesql.pg`UPDATE SESSIONS SET aid=${ aid } WHERE sessionnonce=${ sessionNonce }`)
                      .then(
                        (updates) => {
                          client.release();
                          if (updates.rowCount === 1) {
                            resolve(aid);
                          } else {
                            reject(new Error(`updated ${ updates.rowCount }`));
                          }
                        },
                        releaseAndReject);
                  } else {
                    createNewAccount();
                  }
                }
                client.query(safesql.pg`SELECT aid FROM PersonalInfo WHERE email=${ email }`).then(
                  associateAccountWithSessionNonce,
                  releaseAndReject);
              },
              reject);
          });
        }
      }
      loginPromise.then(
        (aid) => {
          if (aid === null) {
            res.statusCode = 200;
            res.end(template(Object.assign({}, bundle, { email, cont: contUrl.href })));
          } else {
            // Redirect on successful login.
            res.statusCode = STATUS_TEMPORARY_REDIRECT;
            res.setHeader('Location', contUrl.href);
            res.end();
          }
        },
        handleError);
    },
    handleError);
};
