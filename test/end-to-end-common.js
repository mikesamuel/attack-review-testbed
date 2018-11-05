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

/* eslint id-blacklist: 0, no-multi-str: 0, no-magic-numbers: 0, array-element-newline: 0 */

const { expect } = require('chai');
const { it } = require('mocha');

// Make sure that we stub out modules that interact badly with
// some of our protective mechanisms
require('./main-test.js');

// eslint-disable-next-line id-length
const fs = require('fs');
const path = require('path');
const request = require('request');

module.exports = function runEndToEndCases(makeTestFunction, options) {
  const casesDir = path.join(__dirname, 'cases', 'end-to-end');
  // eslint-disable-next-line no-sync
  for (const file of fs.readdirSync(casesDir)) {
    const cookieJar = Object.create(null);
    function cookiesForResponse({ headers }) { // eslint-disable-line no-inner-declarations
      const cookies = headers['set-cookie'];
      if (cookies) {
        for (const cookie of cookies) {
          const match = /^([^=;]*)=([^;]*)/.exec(cookie);
          if (match) {
            const [ , name, value ] = match;
            cookieJar[name] = value;
          }
        }
      }
      return Object.entries(cookieJar)
        .map(([ name, value ]) => `${ name }=${ value }`).join('; ');
    }

    if (!/-case\.js$/.test(file)) {
      continue;
    }

    // eslint-disable-next-line global-require
    const { requests } = require(path.resolve(path.join(casesDir, file)));
    const testFunction = makeTestFunction((baseUrl, done, logs) => {
      let promise = Promise.resolve(null);
      let lastResponse = null;
      // State derived from lastResponse's body.
      let lastDerived = null;
      // Keep track of request-scoped nonces so we can detect reuse.
      const requestNoncesSeen = new Map();

      function postProcessHtml(html) {
        const uploads = new Map();
        let csrf = null;
        html = html.replace(
          /[/]user-uploads[/]([^/."'?# \n]+)[.](\w+)/g,
          (match, basename, ext) => {
            let replacement = uploads.get(match);
            if (!replacement) {
              const serial = String(uploads.size);
              const padding = '0'.repeat(basename.length - serial.length);
              replacement = `/user-uploads/${ padding }${ serial }.${ ext }`;
              uploads.set(match, replacement);
            }
            return replacement;
          });
        html = html.replace(
          /(<input name="_csrf" type="hidden" value=)"([^"]+)"\/?>/g,
          (whole, prefix, value) => {
            csrf = value;
            return `${ prefix }"xxxx"/>`;
          });
        html = html.replace(
          /( nonce=)"([^"\n]{8,})"/g,
          (whole, prefix, nonce) => {
            // If our random number generator generates duplicates, we will
            // get spurious golden failures.  Our nonces should have > 128B
            // of entropy when running tests as external processes so this
            // should not be a problem in practice, and we really need to
            // know if our request nonces are not narrowly scoped.
            if (!requestNoncesSeen.has(nonce)) {
              requestNoncesSeen.set(nonce, requestNoncesSeen.size);
            }
            return `${ prefix }"xxxx${ requestNoncesSeen.get(nonce) }"`;
          });
        return {
          lines: html.replace(/></g, '>\n<').split(/\n/g),
          derived: {
            csrf,
            uploads,
          },
        };
      }

      for (const { req, res, after } of requests(baseUrl, options)) {
        const { body = [], statusCode = 200, logs: { stderr = '', stdout = '' }, headers = {} } =
          typeof res === 'function' ? res(lastResponse, lastDerived) : res;
        promise = new Promise((resolve, reject) => { // eslint-disable-line no-loop-func
          promise.then(
            () => {
              const augmentedRequest = Object.assign(
                {},
                typeof req === 'function' ? req(lastResponse, lastDerived) : req);
              augmentedRequest.headers = Object.assign({}, augmentedRequest.headers || {});
              // Prevents request from complaining that the status is not 200.
              augmentedRequest.simple = false;
              if (lastDerived && lastDerived.csrf) {
                if (augmentedRequest.form) {
                  augmentedRequest.form.csrf = lastDerived.csrf;
                } else if (augmentedRequest.formData) {
                  augmentedRequest.formData.csrf = lastDerived.csrf;
                }
              }

              if (lastResponse) {
                augmentedRequest.headers.Cookie = cookiesForResponse(lastResponse);
              }

              request(augmentedRequest, (exc, response, actualBody) => {
                if (exc) {
                  reject(exc);
                  return;
                }
                const { lines: bodyLines, derived } = postProcessHtml(actualBody);
                lastResponse = response;
                lastDerived = derived;

                const actualHeaders = {};
                for (const headerName of Object.getOwnPropertyNames(headers)) {
                  actualHeaders[headerName] = response.headers[headerName];
                }

                const stableLogs = logs();
                stableLogs.stderr = stableLogs.stderr.replace(/\n {4}at .*/g, '');

                const got = {
                  exc: exc || null,
                  body: bodyLines,
                  headers: actualHeaders,
                  logs: stableLogs,
                  statusCode: response && response.statusCode,
                };
                const want = {
                  exc: null,
                  body,
                  headers,
                  logs: {
                    stderr,
                    stdout,
                  },
                  statusCode,
                };
                if (want.body === 'IGNORE') {
                  delete got.body;
                  delete want.body;
                }

                try {
                  expect(got).to.deep.equal(want);
                  if (after) {
                    after(response, bodyLines, derived);
                  }
                  // Drain any logs created by after.
                  expect(logs()).to.deep.equals({ stderr: '', stdout: '' });
                } catch (testFailure) {
                  reject(testFailure);
                  return;
                }
                resolve(null);
              });
            },
            reject);
        });
      }
      promise.then(() => done(), done);
    }, options);
    it(file.replace(/\.js$/, ''), testFunction);
  }
};
