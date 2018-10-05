#!/usr/bin/env ./bin/node --cjs-loader ./lib/init-hooks.js

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
const { isProduction } = require('./lib/framework/is-prod.js');
// eslint-disable-next-line no-process-env
if (!isProduction && process.env.UNSAFE_DISABLE_NODE_SEC_HOOKS === 'true') {
  // There will inevitably be a "disable because I'm developing" switch so
  // we ought test whether it's easy to workaround checks that dev features
  // aren't abusable in production.
  // eslint-disable-next-line no-console
  console.log('Running in insecure mode');
  setInsecure(true);
}

// Lock down intrinsics early so security critical code can rely on properties
// of objects that they create and which do not escape.
require('./lib/framework/lockdown.js')();

// Configure access control checks to contract type constructors.
require('node-sec-patterns').authorize(require('./package.json'));

const path = require('path');

const { start } = require('./lib/server.js');

if (require.main === module) {
  const argv = [ ...process.argv ];
  // './bin/node'
  argv.shift();
  // __filename
  argv.shift();

  const defaultHostName = 'localhost';
  const defaultPort = 8080;
  const defaultRootDir = path.resolve(__dirname);

  if (argv[0] === '--help') {
    // eslint-disable-next-line no-console
    console.log(`Usage: ${ __filename } [<hostName> [<port> [<rootdir>]]]

<hostname>: The hostname the service is typically reached under.  Default ${ defaultHostName }
<port>:     The local port to listen on.  Default ${ defaultPort }
<rootdir>:  The root directory to use for static files and stored uploads.
            Default "$PWD": ${ defaultRootDir }
`);
  } else {
    const [ hostName = defaultHostName, port = defaultPort, rootDir = defaultRootDir ] = argv;
    const { stop } = start(
      { hostName, port, rootDir, dbConfig: null },
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
    process.on('SIGINT', stop);
  }
}

// :)
