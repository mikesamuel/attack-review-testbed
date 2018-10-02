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
 * Prevents non-additive changes to builtins, the global object, and make
 * transparent when native modules are accessed ambiently.
 *
 * This does not prevent all monkeypatching of builtins, but does mean that
 * console internals and core modules like 'fs' and 'path' can get a trusted
 * path to Function.protoype.call.
 *
 * This is best effort.  If it runs before anything else freezes properties,
 * then it will prevent some unintentional interference between modules.
 */

// eslint-disable-next-line no-use-before-define
module.exports = lockdown;

const { exit } = process;
const { apply } = Reflect;

const globalObject = global;

const {
  create,
  defineProperties,
  hasOwnProperty,
  getOwnPropertyDescriptor,
  getOwnPropertyDescriptors,
  getOwnPropertyNames,
  getOwnPropertySymbols,
} = Object;

const languageIntrinsics = [
  /* eslint-disable array-element-newline */
  // Buffer is actually a Node builtin
  Array, ArrayBuffer, Boolean, Buffer, console, Date, EvalError, Error,
  Float32Array, Float64Array, Function, Int8Array, Int16Array, Int32Array,
  Intl, JSON, Object, Map, Math, Number, Promise, Proxy, RangeError,
  ReferenceError, Reflect, RegExp, Set, String, Symbol, SyntaxError, TypeError,
  // eslint-disable-next-line no-undef
  URIError, Uint8Array, Uint16Array, Uint32Array, Uint8ClampedArray, WeakMap, WeakSet, WebAssembly,
  /* eslint-enable array-element-newline */
];

const importantGlobalKeys = [ 'Infinity', 'NaN', 'global', 'GLOBAL', 'isFinite', 'isNaN', 'root', 'undefined' ];

const builtinModuleIds = require('./builtin-module-ids.js');

const unprivilegedRequire = require('./unprivileged-require.js');

function lockdownOwnPropertiesOf(obj, keys) {
  const descriptors = getOwnPropertyDescriptors(obj);
  keys = keys || [ ...getOwnPropertyNames(descriptors), ...getOwnPropertySymbols(descriptors) ];
  const newDescriptors = create(null);
  for (let i = 0, len = keys.length; i < len; ++i) {
    const key = keys[i];
    const descriptor = descriptors[key];
    if (descriptor.configurable) {
      descriptor.configurable = false;
      if (apply(hasOwnProperty, descriptor, [ 'value' ])) {
        descriptor.writable = false;
      }
      newDescriptors[key] = descriptor;
      try {
        delete obj[key];
      } catch (exc) {
        // best effort
      }
    }
  }
  defineProperties(obj, newDescriptors);
}

function lockdownIntrinsics() {
  const globalsToPin = [];
  // Pin core prototype methods in place.
  for (const languageIntrinsic of languageIntrinsics) {
    lockdownOwnPropertiesOf(languageIntrinsic);
    if (typeof languageIntrinsic === 'function' && languageIntrinsic.prototype) {
      lockdownOwnPropertiesOf(languageIntrinsic.prototype);
    }
    if (typeof languageIntrinsic === 'function' && languageIntrinsic.name &&
        globalObject[languageIntrinsic.name] === languageIntrinsic) {
      globalsToPin[globalsToPin.length] = languageIntrinsic.name;
    }
  }
  return globalsToPin;
}

function lockdown() {
  try {
    const globalsToPin = [ ...importantGlobalKeys, ...lockdownIntrinsics() ];

    // Pin important globals in place.
    lockdownOwnPropertiesOf(globalObject, globalsToPin);

    // Replace native modules reflected in globals with getters so that require
    // hooks apply to them.
    // This applies only to 'process' in the normal case.
    // in REPL mode though, almost all builtin modules are reflected via getters.
    const globalDescriptors = create(null);
    for (const builtinModuleId of builtinModuleIds) {
      if (apply(hasOwnProperty, globalObject, [ builtinModuleId ])) {
        const descriptor = getOwnPropertyDescriptor(globalObject, builtinModuleId);
        if (!descriptor.configurable) {
          continue;
        }
        // Many builtin modules are reflected via getters which use the internal
        // require which should be treated as privileged.
        // Additionally, experimental modules like http2 trigger a process-level
        // warning when required, so do not check the value when reflected via a
        // getter.
        if (apply(hasOwnProperty, descriptor, [ 'value' ]) &&
            // eslint-disable-next-line global-require
            descriptor.value !== require(builtinModuleId)) {
          continue;
        }
        delete descriptor.value;
        delete descriptor.writable;
        // Do not change configure so that application code that runs after lockdown
        // may mask or unlink these.
        descriptor.get = ((moduleId) => () => unprivilegedRequire(moduleId))(builtinModuleId);
        try {
          delete globalObject[builtinModuleId];
        } catch (exc) {
          // best effort
        }
        globalDescriptors[builtinModuleId] = descriptor;
      }
    }
    defineProperties(globalObject, globalDescriptors);
  } catch (exc) {
    try {
      // eslint-disable-next-line no-console
      console.error(exc);
    } finally {
      // Fail hard.
      exit(1);
      // TODO: reallyExit?
    }
  }
}
