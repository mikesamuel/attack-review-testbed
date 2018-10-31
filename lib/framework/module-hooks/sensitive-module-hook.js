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
 * Checks that modules that are trying to require sensitive modules are allowed.
 *
 * See documentation for the config parameter below.
 */

// SENSITIVE - Gates access to modules that are known to be prone to misuse
// in ways that have security consequences.

// GUARANTEE - the output of makeModuleHook only returns a module
// identifier M if M will not resolve to a sensitive module or if the
// requestor is on that module's whitelist or that sensitive module is
// configured in "mode":"report-only".
// This guarantee should survive in the face of an attacker who can
// create files including symlinks and hardlinks but makes no
// guarantee in the face of race conditions related to renaming
// ancestor directories, or unmounting file systems.
// This may assume that ./innocuous.js is not a sensitive module.

// eslint-disable-next-line no-use-before-define
exports.makeHook = makeHook;

const { setTimeout, Set } = global;
const { isArray, prototype: { filter }, from: arrayFrom } = Array;
const { stringify } = JSON;
const { create, entries } = Object;
const { apply } = Reflect;
const { warn } = console;
const { has: setHas } = Set.prototype;
const { replace, toLowerCase } = String.prototype;

const { basename, join, relative, resolve, sep } = require('path');
const process = require('process');
const { isBuiltinModuleId } = require('../builtin-module-ids.js');
const { isProduction } = require('../is-prod.js');

const isFileSystemCaseSensitive = (() => {
  try {
    require.resolve(`./${ basename(__filename).toUpperCase() }`);
    return true;
  } catch (exc) {
    return false;
  }
})();

/**
 * Returns a hook compatible with `node --cjs-loader`.
 *
 * @param {!Object} sensitiveModuleConfig maps ids (resolved relative to base path)
 *     of sensitive modules to arrays of ids of modules allowed to import the
 *     sensitive module.
 *     If the id maps to an object instead, it should look like
 *     {
 *       "ids": [ "id0", "id1", "id2" ],  // Allowed to import
 *       "mode": "enforce",  // enforce (default) or report-only
 *       "advice": "Dumped to console to suggest to developer alternatives or how to get approved"
 *     }
 * @param {string} basePath path to project root.
 * @param {boolean} reportOnly true to not provide an innocuous replacement
 *     for unauthorized requests to a sensitive module.
 * @return {!Function} a CJS module hook.
 */
function makeHook(sensitiveModuleConfig, basePath, reportOnly = false) {
  const missingConfig = !sensitiveModuleConfig;
  basePath = resolve(basePath);

  const moduleid = relative(basePath, __filename);

  // eslint-disable-next-line no-underscore-dangle
  const rootResolvePaths = [ basePath, ...module.constructor._nodeModulePaths(basePath) ];
  function rootResolve(x) {
    return require.resolve(x, { paths: rootResolvePaths });
  }

  function toModuleKey(id, resolveModuleId = rootResolve) {
    if (isBuiltinModuleId(id)) {
      return id;
    }
    let moduleKey = relative(basePath, resolveModuleId(id));
    if (isFileSystemCaseSensitive) {
      // TODO: just because one physical device is case-insensitive does not
      // mean all are.  Is there a reliably way to canonicalize
      moduleKey = apply(toLowerCase, moduleKey, []);
    }
    return moduleKey;
  }

  function fileToModuleKey(filePath) {
    let moduleKey = filePath;
    if (sep === '\\') {
      moduleKey = apply(replace, moduleKey, [ /\\/g, '/' ]);
    }
    if (isFileSystemCaseSensitive) {
      // TODO: just because one physical device is case-insensitive does not
      // mean all are.  Is there a reliably way to canonicalize
      moduleKey = apply(toLowerCase, moduleKey, []);
    }
    return moduleKey;
  }

  // eslint-disable-next-line complexity
  function unpackConfig() {
    const sensitiveModules = new Map();
    const moduleAdvice = new Map();
    const reportOnlyModules = new Set();
    for (const [ src, val ] of entries(sensitiveModuleConfig || {})) {
      let advice = null;
      let mode = null;
      let dests = null;
      const key = toModuleKey(src);
      if (typeof val === 'object' && val && !isArray(val)) {
        ({ ids: dests, advice, mode } = val);
      } else {
        dests = val;
      }
      if (typeof dests === 'string' && dests) {
        dests = [ dests ];
      }
      if (isArray(dests)) {
        dests = [ ...dests ];
      } else {
        dests = [];
      }
      dests = apply(filter, dests, [ (x) => typeof x === 'string' ]);

      if (typeof advice === 'string') {
        moduleAdvice.set(key, advice);
      }
      if (mode === 'report-only') {
        reportOnlyModules.add(key);
      }
      sensitiveModules.set(
        key,
        new Set(dests.map((str) => toModuleKey(str))));
    }
    return { sensitiveModules, moduleAdvice, reportOnlyModules };
  }

  const { sensitiveModules, moduleAdvice, reportOnlyModules } = unpackConfig();
  const isSensitive = sensitiveModules.has.bind(sensitiveModules);
  const getImporters = sensitiveModules.get.bind(sensitiveModules);
  const getAdvice = moduleAdvice.get.bind(moduleAdvice);
  const isModuleReportOnly = reportOnlyModules.has.bind(reportOnlyModules);

  let notifyTimeout = null;
  let notifications = [];
  const advised = new Set();

  function notify() {
    notifyTimeout = null;
    const list = notifications;
    notifications = [];

    const byModuleKey = create(null);
    for (let i = 0, { length } = list; i < length; ++i) {
      const element = list[i];
      const { moduleKey, requiredId, importingRelFile, enforce } = element;
      let group = byModuleKey[moduleKey];
      if (!group) {
        group = { moduleKey, requiredId, importingRelFiles: new Set(), enforce };
        byModuleKey[moduleKey] = group;
      }
      group.importingRelFiles.add(importingRelFile);
    }

    for (const moduleKey in byModuleKey) {
      const { requiredId, importingRelFiles, enforce } = byModuleKey[moduleKey];
      const action = enforce ? 'Blocking' : 'Reporting';
      let msg = `${ moduleid }: ${ action } require(${ stringify(requiredId) }) by ${ arrayFrom(importingRelFiles) }`;
      if (!isProduction && !advised.has(moduleKey)) {
        advised.add(moduleKey);
        const advice = getAdvice(moduleKey);
        if (advice) {
          msg = `${ msg }\n\n\t${ advice }`;
        }
      }
      warn(msg);
    }
  }

  process.on('beforeExit', () => {
    if (notifyTimeout !== null) {
      notify();
    }
  });

  function sensitiveModuleHook(importingFile, importingId, requiredId, resolveModuleId) {
    const moduleKey = toModuleKey(requiredId, resolveModuleId);
    if (missingConfig || isSensitive(moduleKey)) {
      const importingRelFile = relative(basePath, importingFile);
      const importingKey = fileToModuleKey(importingRelFile);
      const allowedImporters = getImporters(moduleKey);
      if (!apply(setHas, allowedImporters, [ importingKey ])) {
        const enforce = reportOnly !== true && !isModuleReportOnly(moduleKey);

        notifications[notifications.length] = { moduleKey, requiredId, importingRelFile, importingId, enforce };
        if (notifyTimeout === null) {
          // eslint-disable-next-line no-magic-numbers
          notifyTimeout = setTimeout(notify, 100);
        }

        if (enforce) {
          return join(__dirname, 'innocuous.js');
        }
      }
    }
    return requiredId;
  }

  sensitiveModuleHook.flush = notify;

  return sensitiveModuleHook;
}
