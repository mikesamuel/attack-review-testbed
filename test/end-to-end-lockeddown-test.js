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

const { describe } = require('mocha');
const path = require('path');
const process = require('process');

const runEndToEndCases = require('./end-to-end-common.js');

const externalProcessTestServer = require('./external-process-test-server.js');
const root = path.resolve(path.join(__dirname, '..'));

// eslint-disable-next-line no-process-env
if (process.env.SOURCE_LIST_UP_TO_DATE !== '0' && !('TRAVIS' in process.env)) {
  describe('end-to-end-lockeddown', () => {
    const options = {
      // We pass NODE_ENV=production.
      isProduction: true,
      quiet: true,
      root,
    };
    const externalProcessTest = externalProcessTestServer(root);
    runEndToEndCases(externalProcessTest, options);
  });
}
