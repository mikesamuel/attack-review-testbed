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

// SENSITIVE - Defines a trusted require hook.

// GUARANTEE - By controlling who edits ../../package.json, security
// specialists can exercise oversight over which modules can load
// sensitive modules.

// The hook code below would be much more complicated if it could
// reenter itself while unpacking its configuration.
// Rather than trying to identify and workaround those complications
// we use a monotonic state variable that turns off checks while
// trusted code is initializing and rely on that trusted code to not
// allow untrusted inputs to reach require.  This code should run
// before any HTTP select loops are entered, so the major vectors
// for untrusted inputs have not yet attached.
let enabled = false;
// We need to fail closed which means failing with a hook, and not
// leaving enabled false after module exit.
try {
  // eslint-disable-next-line no-use-before-define
  module.exports = beforeRequire;

  const String = ''.constructor;
  const { TypeError } = global;

  // eslint-disable-next-line global-require, id-length
  const fs = require('fs');
  // eslint-disable-next-line global-require
  const path = require('path');
  // eslint-disable-next-line global-require
  const { makeHook: makeResourceIntegrityHook } = require(
    './module-hooks/resource-integrity-hook.js');
  // eslint-disable-next-line global-require
  const { makeHook: makeSensitiveModuleHook } = require(
    './module-hooks/sensitive-module-hook.js');

  // Look for the project root by starting at the main module, which should
  // be loading these hooks via --cjs-loader and looking for a package.json
  // directory.
  let basedir = path.resolve(path.join(path.dirname(require.main.filename)));
  // eslint-disable-next-line no-sync
  while (!fs.existsSync(path.join(basedir, 'package.json'))) {
    basedir = path.dirname(basedir);
  }

  // Fetch configuration data
  const prodSources = (() => {
    try {
      // eslint-disable-next-line global-require
      return require(path.join(basedir, 'generated', 'prod-sources.json'));
    } catch (exc) {
      return null;
    }
  })();
  // eslint-disable-next-line global-require
  const { sensitiveModules } = require(path.join(basedir, 'package.json'));

  // Create hooks
  const riHook = makeResourceIntegrityHook(prodSources, basedir, false);
  const smHook = makeSensitiveModuleHook(sensitiveModules, basedir, false);

  // eslint-disable-next-line no-inner-declarations
  function beforeRequire(importingFile, importingId, requiredId, resolve) {
    if (typeof resolve !== 'function') {
      throw new TypeError();
    }
    importingFile = String(importingFile);
    importingId = String(importingId);
    requiredId = String(requiredId);

    if (enabled) {
      return smHook(
        importingFile, importingId,
        riHook(importingFile, importingId, requiredId, resolve),
        resolve);
    }
    return requiredId;
  }

  beforeRequire.flush = () => {
    if (typeof riHook.flush === 'function') {
      riHook.flush();
    }
    if (typeof smHook.flush === 'function') {
      smHook.flush();
    }
  };
} finally {
  // Exit privileged mode
  enabled = true;
}

module.exports.setInsecure = (insecure) => {
  if (insecure === true) {
    enabled = false;
  }
};
