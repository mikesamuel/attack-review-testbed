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
 * Runs the same test suite as end-to-end-test, but in a separate process.
 * It helps to have both of these.
 *
 * end-to-end-test tests code coverage and builds the dynamic module graph
 * used by scripts/generate-production-source-list.js.
 *
 * This test checks that we get the same results even when the security
 * machinery under lib/framework is in production configuration.
 */

const childProcess = require('child_process');
const { describe } = require('mocha');
const path = require('path');
const process = require('process');
const { URL } = require('url');

const runEndToEndCases = require('./end-to-end-common.js');

const { setTimeout } = global;

const quiet = true;

function externalProcessTest(testFun) {
  return function test(done) {
    // Each process has to spin up its own database, so this takes a bit longer
    // than the in-process tests.
    this.slow(5000); // eslint-disable-line no-invalid-this, no-magic-numbers
    this.timeout(10000); // eslint-disable-line no-invalid-this, no-magic-numbers

    const tStart = Date.now();
    function logTestEvent(str) {
      if (!quiet) {
        // eslint-disable-next-line no-console
        console.log(`t+${ Date.now() - tStart } ${ str }`);
      }
    }

    const root = path.resolve(path.join(__dirname, '..'));
    const serverProcess = childProcess.spawn(
      path.join(root, 'scripts', 'run-locally.js'),
      // Ask server to pick a non-conflicting port.mom
      [ 'localhost', '0' ],
      {
        cwd: root,
        env: Object.assign(
          {},
          // eslint-disable-next-line no-process-env
          process.env,
          {
            NODE_ENV: 'production',
            UNSAFE_DISABLE_NODE_SEC_HOOKS: 'false',
          }),
        stdio: [ 'ignore', 'pipe', 'pipe' ],
        shell: false,
      });
    logTestEvent(`Spawned process ${ serverProcess.pid }`);

    let calledDone = false;
    function shutdown(exc) {
      try {
        serverProcess.stdout.destroy();
        serverProcess.stderr.destroy();
        if (!serverProcess.killed) {
          logTestEvent(`Ending process ${ serverProcess.pid }`);
          serverProcess.kill('SIGINT');
        }
      } catch (shutdownFailure) {
        exc = exc || shutdownFailure || new Error('shutdown failed');
        if (exc !== shutdownFailure) {
          // eslint-disable-next-line no-console
          console.error(shutdownFailure);
        }
      }

      if (!calledDone) {
        calledDone = true;
        if (exc) {
          logTestEvent('Done with error');
          done(exc); // eslint-disable-line callback-return
        } else {
          logTestEvent('Done without error');
          done(); // eslint-disable-line callback-return
        }
      } else if (exc) {
        // eslint-disable-next-line no-console
        console.error(exc);
      }
    }

    let stdout = '';
    let stderr = '';
    let ready = false;
    let baseUrl = null;

    function logs() {
      const result = { stdout, stderr };
      ([ stdout, stderr ] = [ '', '' ]);
      return result;
    }
    serverProcess.unref();
    serverProcess.on('close', () => {
      logTestEvent('CLOSED');

      if (ready) {
        shutdown();
      } else {
        shutdown(new Error('Server did not start serving'));
      }
    });
    serverProcess.on('error', (exc) => done(exc || new Error('spawn failed')));

    serverProcess.stdout.on('data', (chunk) => {
      logTestEvent(`STDOUT [[${ chunk }]]`);
      stdout += chunk;
      if (!ready) {
        if (baseUrl === null) {
          const match = /(?:^|\n)Serving from localhost:(\d+) at /.exec(stdout);
          if (match) {
            logTestEvent('GOT PORT');
            const actualPort = Number(match[1]);
            baseUrl = new URL(`http://localhost:${ actualPort }`);
          }
        }
        if (/(?:^|\n)Database seeded with test data\n/.test(stdout)) {
          logTestEvent('READY');
          ready = true;
          setTimeout(
            () => {
              logTestEvent('TESTING');
              // Flush before starting test
              logs();
              testFun(baseUrl, shutdown, logs);
            },
            // eslint-disable-next-line no-magic-numbers
            50);
        }
      }
    });
    serverProcess.stderr.on('data', (chunk) => {
      logTestEvent(`STDERR [[${ chunk }]]`);
      stderr += chunk;
    });
  };
}

// eslint-disable-next-line no-process-env
if (process.env.SOURCE_LIST_UP_TO_DATE !== '0' && !('TRAVIS' in process.env)) {
  describe('end-to-end-lockeddown', () => {
    // We pass NODE_ENV=production above.
    const isProduction = true;
    runEndToEndCases(externalProcessTest, isProduction);
  });
}
