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

// eslint-disable-next-line no-use-before-define
exports.makeHook = makeHook;

const { basename, join, relative, resolve, sep } = require('path');
const { isBuiltinModuleId } = require('../builtin-module-ids.js');
const { isProduction } = require('../is-prod.js');

const { isArray, prototype: { filter } } = Array;
const { apply } = Reflect;
const { warn } = console;
const { has: setHas } = Set.prototype;
const { replace, toLowerCase } = String.prototype;

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
 *       "advice": "Dumped to console to suggest to developer alternatives or how to get approved"
 *     }
 * @param {string} basePath path to project root.
 * @param {boolean} reportOnly true to not provide an innocuous replacement
 *     for unauthorized requests to a sensitive module.
 * @return {!Function} a CJS module hook.
 */
function makeHook(sensitiveModuleConfig, basePath, reportOnly = false) {
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

  const missingConfig = !sensitiveModuleConfig;
  const sensitiveModules = new Map();
  const moduleAdvice = new Map();
  for (const [ src, val ] of Object.entries(sensitiveModuleConfig || {})) {
    let advice = null;
    let dests = null;
    const key = toModuleKey(src);
    if (typeof val === 'object' && val && !isArray(val)) {
      ({ ids: dests, advice } = val);
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
    sensitiveModules.set(
      key,
      new Set(dests.map((str) => toModuleKey(str))));
  }

  const isSensitive = sensitiveModules.has.bind(sensitiveModules);
  const getImporters = sensitiveModules.get.bind(sensitiveModules);
  const getAdvice = moduleAdvice.get.bind(moduleAdvice);

  return function sensitiveModuleHook(importingFile, importingId, requiredId, resolveModuleId) {
    const moduleKey = toModuleKey(requiredId, resolveModuleId);
    if (missingConfig || isSensitive(moduleKey)) {
      const importingRelFile = relative(basePath, importingFile);
      const importingKey = fileToModuleKey(importingRelFile);
      const allowedImporters = getImporters(moduleKey);
      if (!apply(setHas, allowedImporters, [ importingKey ])) {
        let msg = `${ moduleid }: Blocking require(${ JSON.stringify(requiredId) }) by ${ importingRelFile }`;
        if (!isProduction) {
          const advice = getAdvice(moduleKey);
          if (advice) {
            msg = `${ msg }\n\t${ advice }`;
          }
        }
        warn(msg);
        if (reportOnly !== true) {
          return join(__dirname, 'innocuous.js');
        }
      }
    }
    return requiredId;
  };
}
