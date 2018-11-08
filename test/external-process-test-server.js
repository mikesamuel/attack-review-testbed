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
 * Provides a test function compatible with ./end-to-end-common.js that
 * spins up a server per test case as a child process.
 */

const childProcess = require('child_process');
const path = require('path');
const process = require('process');
const { URL } = require('url');

const { setTimeout } = global;

const shutdowns = [];
process.on('SIGINT', () => {
  const failure = new Error('interrupted');
  for (const shutdown of shutdowns) {
    try {
      shutdown(failure);
    } catch (exc) {
      console.error(exc); // eslint-disable-line no-console
    }
  }
  shutdowns.length = 0;
});

/**
 * Given a root path fires up /path/to/root/scripts/run-locally.js.
 */
module.exports = (root) => function externalProcessTest(testFun, { quiet, isProduction }) {
  return function test(done) {
    // Each process has to spin up its own database, so this takes a bit longer
    // than the in-process tests.
    this.slow(7500); // eslint-disable-line no-invalid-this, no-magic-numbers
    this.timeout(15000); // eslint-disable-line no-invalid-this, no-magic-numbers

    const tStart = Date.now();
    function logTestEvent(str) {
      if (!quiet) {
        // eslint-disable-next-line no-console
        console.log(`t+${ Date.now() - tStart } ${ str }`);
      }
    }

    let serverProcess = childProcess.spawn(
      path.join(root, 'scripts', 'run-locally.js'),
      [
        // Do not append to the attacker's logfile.
        '--log', '/dev/null', // eslint-disable-next-line array-element-newline
        /* Ask server to pick a non-conflicting port. */
        'localhost', '0',
      ],
      {
        cwd: root,
        env: Object.assign(
          {},
          // eslint-disable-next-line no-process-env
          process.env,
          {
            NODE_ENV: isProduction ? 'production' : 'test',
            UNSAFE_DISABLE_NODE_SEC_HOOKS: 'false',
          }),
        stdio: [ 'ignore', 'pipe', 'pipe' ],
        shell: false,
      });
    logTestEvent(`Spawned process ${ serverProcess.pid }`);

    let calledDone = false;
    function shutdown(exc) {
      if (serverProcess) {
        try {
          serverProcess.stdout.destroy();
          serverProcess.stderr.destroy();
          if (!serverProcess.killed) {
            logTestEvent(`Ending process ${ serverProcess.pid }`);
            serverProcess.kill('SIGINT');
          }
          serverProcess = null;
        } catch (shutdownFailure) {
          exc = exc || shutdownFailure || new Error('shutdown failed');
          if (exc !== shutdownFailure) {
            // eslint-disable-next-line no-console
            console.error(shutdownFailure);
          }
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
    shutdowns.push(shutdown);

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
        shutdown(new Error(`Server did not start serving\n${ JSON.stringify(logs(), null, 2) }`));
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
};
