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
 * Remove the association between the current session and any account.
 */

const { URL } = require('url');

const safesql = require('safesql');
const template = require('./logout.pug');

// eslint-disable-next-line no-magic-numbers
const STATUS_TEMPORARY_REDIRECT = 302;

exports.handle = (bundle) => {
  const { res, req, reqUrl, database, handleError, sessionNonce } = bundle;

  let contUrl = null;
  {
    const cont = reqUrl.searchParams.get('cont') || req.headers.referer || '/';
    contUrl = new URL(cont, reqUrl);
    if (contUrl.origin !== reqUrl.origin) {
      contUrl = new URL('/login', reqUrl);
    }
  }

  if (req.method !== 'POST') {
    // Can't do something non-idemopotent on GET.
    // Display a logout button.
    res.end(template(Object.assign({}, bundle, { cont: contUrl.href })));
    return;
  }

  database.connect().then(
    (client) => {
      client.query(safesql.pg`UPDATE SESSIONS SET aid=NULL WHERE sessionnonce=${ sessionNonce }`)
        .then(
          () => {
            client.release();
            res.statusCode = STATUS_TEMPORARY_REDIRECT;
            res.setHeader('Location', contUrl.href);
            res.end();
          },
          (exc) => {
            client.release();
            handleError(exc);
          });
    },
    handleError);
};
