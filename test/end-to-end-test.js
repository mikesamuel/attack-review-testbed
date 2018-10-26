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

const { describe } = require('mocha');

// Make sure that we stub out modules that interact badly with
// some of our protective mechanisms
require('./main-test.js');

// eslint-disable-next-line id-length
const path = require('path');
const process = require('process');
const { URL } = require('url');
const { startCapture, startIntercept, stopCapture, stopIntercept } = require('capture-console');
const { clearTables, initializeTablesWithTestData } = require('../lib/db-tables.js');

const { start } = require('../lib/server.js');
const runEndToEndCases = require('./end-to-end-common.js');

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

  function serverTestFunction(testFun) {
    return function test(done) {
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
        {});
    };
  }

  describe('end-to-end', () => {
    runEndToEndCases(serverTestFunction);
  });
};
