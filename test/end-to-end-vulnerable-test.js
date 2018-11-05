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
 * Runs the same test suite as end-to-end-test, but in a separate process
 * and against the vulnerable variant of the server.
 */

const { describe } = require('mocha');
const path = require('path');
const process = require('process');

const runEndToEndCases = require('./end-to-end-common.js');

const externalProcessTestServer = require('./external-process-test-server.js');
const root = path.resolve(path.join(__dirname, '..', 'vulnerable'));

// eslint-disable-next-line no-process-env
if (process.env.SOURCE_LIST_UP_TO_DATE !== '0') {
  describe('end-to-end-vulnerable', () => {
    const options = {
      isVulnerable: true,
      // Vulnerable server hardcodes isProduction to true.
      isProduction: true,
      quiet: true,
      root,
    };
    const externalProcessTest = externalProcessTestServer(root);
    runEndToEndCases(externalProcessTest, options);
  });
}
