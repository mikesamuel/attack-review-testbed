#!/bin/echo Use scripts/run-locally.js or npm start instead

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
 * This ensures that trusted code runs early where it has access to builtins
 * before any monkeypatching by the majority of unprivileged modules.
 */

// SENSITIVE - Shebang enables early loaded trusted hooks, and code enables security machinery.

const { execSync } = require('child_process');
const fs = require('fs'); // eslint-disable-line id-length
const path = require('path');
const process = require('process');

const isMain = require.main === module;

require('./lib/framework/bootstrap-secure.js')(path.resolve(__dirname), isMain);

const { start } = require('./lib/server.js');
const safepg = require('./lib/safe/pg.js');
const { initializeTablesWithTestData } = require('./lib/db-tables');
const { flock } = require('fs-ext');

const processInfo = {
  pid: process.pid,
  argv: [ ...process.argv ],
  start: Date.now(),
  lastcommit: (() => {
    try {
      return execSync('git rev-parse HEAD', { encoding: 'utf8' }).replace(/\s+$/, '');
    } catch (exc) {
      return 'git failed';
    }
  })(),
  localhash: (() => {
    try {
      // `git rev-parse HEAD` does not include changes to the local client.
      // This doesn't included unadded files, but is better.
      return execSync('git show --pretty=%h --abbrev=32 | shasum -ba1', { encoding: 'utf8' }).replace(/\s+$/, '');
    } catch (exc) {
      return 'git failed';
    }
  })(),
};

if (isMain) {
  // Fail fast if run via `node main.js` instead of as a script with the flags from #! above.
  let evalWorks = true;
  try {
    eval(String(Math.random())); // eslint-disable-line no-eval
  } catch (evalFailed) {
    evalWorks = false;
  }

  const argv = [ ...process.argv ];
  // './bin/node'
  argv.shift();
  // __filename
  argv.shift();

  let requestLogFile = './request.log';

  let initDb = true;
  flagloop:
  for (;;) {
    switch (argv[0]) {
      case '--noinitdb':
        argv.shift();
        initDb = false;
        break;
      case '--log':
        argv.shift();
        requestLogFile = argv.shift();
        break;
      case '--':
        argv.shift();
        break flagloop;
      default:
        break flagloop;
    }
  }

  const defaultHostName = 'localhost';
  const defaultPort = 8080;
  const defaultRootDir = path.resolve(__dirname);

  if (evalWorks || argv[0] === '--help') {
    // eslint-disable-next-line no-console
    console.log(`Usage: ${ __filename } [--noinitdb] [<hostName> [<port> [<rootdir>]]]

<hostname>: The hostname the service is typically reached under.  Default ${ defaultHostName }
<port>:     The local port to listen on.  Default ${ defaultPort }
<rootdir>:  The root directory to use for static files and stored uploads.
            Default "$PWD": ${ defaultRootDir }
`);
  } else {
    const [ hostName = defaultHostName, port = defaultPort, rootDir = defaultRootDir ] = argv;
    const database = new safepg.Pool();
    // eslint-disable-next-line no-magic-numbers, no-sync
    const requestLogFileDescriptor = requestLogFile === '-' ? 1 : fs.openSync(requestLogFile, 'a', 0o600);

    // Log a request so we can replay attacks.
    // This appends to a log file that hopefully will allow us to playback successful and
    // unsuccessful attacks against variant servers.
    const writeToPlaybackLog = (message) => { // eslint-disable-line func-style
      message = Object.assign(message, { processInfo });
      const octets = Buffer.from(`${ JSON.stringify(message, null, 1) },\n`, 'utf8');
      // 2 means lock exclusively.
      // We lock in case multiple server processes interleave writes to the same channel.
      flock(requestLogFileDescriptor, 2, () => {
        fs.write(requestLogFileDescriptor, octets, (exc) => {
          // 8 means unlock
          // eslint-disable-next-line no-magic-numbers
          flock(requestLogFileDescriptor, 8);
          if (exc) {
            console.error(exc); // eslint-disable-line no-console
          }
        });
      });
    };

    const { stop } = start(
      { hostName, port, rootDir, database, writeToPlaybackLog },
      (exc, actualPort) => {
        if (exc) {
          process.exitCode = 1;
          // eslint-disable-next-line no-console
          console.error(exc);
        } else {
          // Our test fixtures depends on this exact format string.
          // eslint-disable-next-line no-console
          console.log(`Serving from ${ hostName }:${ actualPort } at ${ rootDir }`);
        }
      });

    // eslint-disable-next-line no-inner-declarations
    function tearDown() {
      stop();
      if (requestLogFileDescriptor) {
        // eslint-disable-next-line no-sync
        fs.closeSync(requestLogFileDescriptor);
      }
      try {
        database.end();
      } catch (exc) {
        // Best effort.
      }
    }
    process.on('SIGINT', tearDown);

    if (initDb) {
      initializeTablesWithTestData(database).then(
        () => {
          // Our test fixtures depends on this exact string.
          // eslint-disable-next-line no-console
          console.log('Database seeded with test data');
        },
        (exc) => {
          // eslint-disable-next-line no-console
          console.error(exc);
          tearDown();
        });
    }
  }
}

// :)
