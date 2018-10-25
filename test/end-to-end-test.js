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
const { describe, it } = require('mocha');

// Make sure that we stub out modules that interact badly with
// some of our protective mechanisms
require('./main-test.js');

// eslint-disable-next-line id-length
const fs = require('fs');
const path = require('path');
const process = require('process');
const request = require('request');
const { URL } = require('url');
const { startCapture, startIntercept, stopCapture, stopIntercept } = require('capture-console');
const { clearTables, initializeTablesWithTestData } = require('../lib/db-tables.js');

const { start } = require('../lib/server.js');

const hostName = '127.0.0.1';
const rootDir = path.resolve(path.join(__dirname, '..'));

function noop() {
  // This function body left intentionally blank.
}

module.exports = (makePool) => {
  function withServer(onStart, { cannedData = true }) {
    let i = 0;

    // Substitute for our nonce generator, a function that produces predictable
    // output, so we don't have to deal with nonces in output.
    function notReallyUnguessable() {
      const str = `${ i++ }`;
      return 'x'.repeat(32 - str.length) + str;
    }

    const quiet = true;
    const startTrapLog = quiet ? startIntercept : startCapture;
    const stopTrapLog = quiet ? stopIntercept : stopCapture;

    function withPool() {
      return new Promise((resolve, reject) => {
        makePool().then(
          (pool) => {
            const setup = cannedData ? initializeTablesWithTestData : clearTables;
            setup(pool).then(
              () => {
                resolve(pool);
              },
              (exc) => {
                pool.end();
                reject(exc);
              });
          },
          reject);
      });
    }


    withPool().then(
      (database) => {
        let stdout = '';
        let stderr = '';
        startTrapLog(process.stdout, (chunk) => {
          stdout += chunk;
        });
        startTrapLog(process.stderr, (chunk) => {
          stderr += chunk;
        });
        const { stop } = start(
          { hostName, port: 0, rootDir, database },
          (err, actualPort) => {
            const url = new URL(`http://${ hostName }:${ actualPort }`);
            onStart(
              err, url,
              () => {
                try {
                  stop();
                  database.end();
                } finally {
                  stopTrapLog(process.stderr);
                  stopTrapLog(process.stdout);
                }
              },
              () => {
                const errText = stderr;
                const outText = stdout;
                stderr = '';
                stdout = '';
                return { stderr: errText, stdout: outText };
              });
          },
          notReallyUnguessable);
      },
      (dbConfigErr) => {
        onStart(dbConfigErr, new URL('about:invalid'), noop, () => ({}));
      });
  }

  function serverTest(testName, testFun, options = {}) {
    it(testName, function test(done) {
      this.slow(250); // eslint-disable-line no-invalid-this
      withServer(
        (startErr, url, stop, logs) => {
          let closed = false;
          function closeAndEnd(closeErr) {
            if (!closed) {
              closed = true;
              stop(closeErr);
              if (closeErr) {
                return done(closeErr);
              }
              return done();
            }
            return null;
          }
          if (startErr) {
            closeAndEnd(startErr);
            return;
          }
          try {
            testFun(url, closeAndEnd, logs);
          } catch (exc) {
            closeAndEnd(exc);
            throw exc;
          }
        },
        options);
    });
  }

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
    return {
      lines: html.replace(/></g, '>\n<').split(/\n/g),
      derived: {
        csrf,
        uploads,
      },
    };
  }

  describe('end-to-end', () => {
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

      if (/-case\.js$/.test(file)) {
        // eslint-disable-next-line global-require
        const { name, requests } = require(path.resolve(path.join(casesDir, file)));
        serverTest(name, (baseUrl, done, logs) => {
          let promise = Promise.resolve(null);
          let lastResponse = null;
          let lastDerived = null;
          for (const { req, res, after } of requests(baseUrl)) {
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

                    const got = {
                      exc: exc || null,
                      body: bodyLines,
                      headers: actualHeaders,
                      logs: logs(),
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
        });
      }
    }
  });
};
