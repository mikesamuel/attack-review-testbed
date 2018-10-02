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
 * Loads and configures require hooks.
 */

// eslint-disable-next-line no-use-before-define
module.exports = beforeRequire;

let initializing = true;

const path = require('path');
const { makeHook: makeResourceIntegrityHook } = require(
  './framework/module-hooks/resource-integrity-hook.js');
const { makeHook: makeSensitiveModuleHook } = require(
  './framework/module-hooks/sensitive-module-hook.js');

const prodSources = (() => {
  try {
    // eslint-disable-next-line global-require
    return require('../generated/prod-sources.json');
  } catch (exc) {
    return null;
  }
})();
const { sensitiveModules } = require('../package.json');

const basedir = path.resolve(path.join(__dirname, '..'));

const riHook = makeResourceIntegrityHook(prodSources, basedir, false);
const smHook = makeSensitiveModuleHook(sensitiveModules, basedir, false);

initializing = false;

function beforeRequire(importingFile, importingId, requiredId, resolve) {
  if (initializing) {
    return requiredId;
  }

  return smHook(
    importingFile, importingId,
    riHook(importingFile, importingId, requiredId, resolve),
    resolve);
}
