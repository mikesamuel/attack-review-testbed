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

// Lock down intrinsics early so security critical code can rely on properties
// of objects that they create and which do not escape.
require('./lib/framework/lockdown.js')();

// Load hooks so that dependency graph is complete when running in test mode.
require('./lib/init-hooks.js');

// Configure access control checks to contract type constructors.
require('node-sec-patterns').authorize(require('./package.json'));

const process = require('process');

if (require.main === module) {
  const timeout = setTimeout(
    () => {
      // Pretend server running.
    },
    // eslint-disable-next-line no-magic-numbers
    10000);
  process.on('SIGINT', () => {
    clearTimeout(timeout);
  });
}

// :)
