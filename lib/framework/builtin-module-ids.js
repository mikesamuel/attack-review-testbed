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
 * @fileOverview
 * Exports a list of builtin modules, and also a convenient containment predicate.
 */

const builtinModuleIds =
  Object.getOwnPropertyNames(process.binding('natives'))
    .filter(RegExp.prototype.test.bind(/^[^_][^/\\]+$/));

const builtinModuleIdSet = new Set(builtinModuleIds);
// eslint-disable-next-line no-self-assign
builtinModuleIdSet.has = builtinModuleIdSet.has;

builtinModuleIds.isBuiltinModuleId = function isBuiltinModuleId(moduleId) {
  return builtinModuleIdSet.has(moduleId);
};

Object.freeze(builtinModuleIds);

module.exports = builtinModuleIds;
