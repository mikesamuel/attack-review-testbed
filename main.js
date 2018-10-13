#!/usr/bin/env ./bin/node --cjs-loader ./lib/init-hooks.js --disallow_code_generation_from_strings

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

// Load hooks so that dependency graph is complete when running in test mode.
const { setInsecure } = require('./lib/init-hooks.js');

const process = require('process');
const path = require('path');
const { isProduction } = require('./lib/framework/is-prod.js');

// eslint-disable-next-line no-process-env
const insecureMode = !isProduction && process.env.UNSAFE_DISABLE_NODE_SEC_HOOKS === 'true';
const isMain = require.main === module;

const nodeSecPatterns = require('node-sec-patterns');
const packageJson = require('./package.json');

if (insecureMode) {
  // There will inevitably be a "disable because I'm developing" switch so
  // we ought test whether it's easy to workaround checks that dev features
  // aren't abusable in production.
  // eslint-disable-next-line no-console
  console.log('Running in insecure mode');
  setInsecure(true);
} else if (isMain) {
  // If not running as part of tests, then configure access
  // control checks to contract type constructors.
  nodeSecPatterns.authorize(packageJson);
}

// Install module stubs.
require('./lib/module-stubs.js')(isMain);
// We don't want to install module stubs when running under
// generate-production-source-list since that would mean that
// the resource-integrity-hook rejects the access.

// Files that are definitely needed but not loaded during test running.
// See .mintable.second from package.json.
require('safesql/package.json');
require('web-contract-types/package.json');

// Lock down intrinsics early so security critical code can rely on properties
// of objects that they create and which do not escape.
require('./lib/framework/lockdown.js')();

const { start } = require('./lib/server.js');
const safepg = require('./lib/safe/pg.js');
const { initializeTablesWithTestData } = require('./lib/db-tables');

if (isMain) {
  const argv = [ ...process.argv ];
  // './bin/node'
  argv.shift();
  // __filename
  argv.shift();

  let initDb = true;
  if (argv[0] === '--noinitdb') {
    argv.shift();
    initDb = false;
  }

  const defaultHostName = 'localhost';
  const defaultPort = 8080;
  const defaultRootDir = path.resolve(__dirname);

  if (argv[0] === '--help') {
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

    const { stop } = start(
      { hostName, port, rootDir, database },
      (exc, actualPort) => {
        if (exc) {
          process.exitCode = 1;
          // eslint-disable-next-line no-console
          console.error(exc);
        } else {
          // eslint-disable-next-line no-console
          console.log(`Serving from ${ hostName }:${ actualPort } at ${ rootDir }`);
        }
      });

    // eslint-disable-next-line no-inner-declarations
    function tearDown() {
      stop();
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
