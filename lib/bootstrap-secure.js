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
 * Coordinate startup of various pieces of security machinery.
 */

// TODO: move dependencies in lib/ into lib/framework and move this file there
// so it and lib/framework is self-contained

const process = require('process');
const path = require('path');

const { setInsecure } = require('./init-hooks.js');
const { isProduction } = require('./framework/is-prod.js');

const nodeSecPatterns = require('node-sec-patterns');
const installModuleStubs = require('./module-stubs.js');
const lockdown = require('./framework/lockdown.js');

module.exports = function bootstrap(projectRoot, isMain) {
  const insecureMode = !isProduction &&
    // eslint-disable-next-line no-process-env
    process.env.UNSAFE_DISABLE_NODE_SEC_HOOKS === 'true';

  // eslint-disable-next-line global-require
  const packageJson = require(path.join(projectRoot, 'package.json'));

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

  // Visit files that are definitely needed but not loaded when running
  // generate-production-source-list.js.
  if (packageJson.mintable && packageJson.mintable.second) {
    for (const second of packageJson.mintable.second) {
      // eslint-disable-next-line global-require
      require(`${ second }/package.json`);
    }
  }

  // Install module stubs.
  installModuleStubs(isMain);
  // We don't want to install module stubs when running under
  // generate-production-source-list since that would mean that
  // the resource-integrity-hook rejects the access.

  // Lock down intrinsics early so security critical code can rely on properties
  // of objects that they create and which do not escape.
  lockdown();
};
