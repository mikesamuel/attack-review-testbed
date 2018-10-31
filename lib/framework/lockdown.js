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
 * apparent when native modules like 'process' are accessed ambiently.
 *
 * This does not prevent all monkeypatching of builtins, but does mean that
 * console internals and core modules like 'fs' and 'path' can get a trusted
 * path to Function.protoype.call.
 *
 * This is best effort.  If it runs before anything else freezes properties,
 * then it will prevent some interference between modules.
 */

// SENSITIVE - adds hooks that affect all loaded modules.

// GUARANTEE - ability to use `new Function(...)` to load code could be
// restricted to a whitelist of modules allowed to access "vm".

// TODO: lockdown vm in package.json

// GUARANTEE - myFunction.call and myFunction.apply mean what developers
// expect if they declared myFunction.  No guarantee is made about
// `.call` of apparent functions received from outside because proxies.
// GUARANTEE - `String(x)` in module code that does not itself introduce
// a local name `String` returns a value x such that typeof x === 'string'.

// CAVEAT - We mask process in user-land modules that load via require
// hooks on .js code.  This does nothing to restrict global['process'].
// We cannot do so without affecting builtin module code that uses
// global references to `process` because invoking require('process')
// would introduce chicken-egg problems.
// The guarantee below is almost certainly trivially violable in ways
// that we can't fix but it's worth attacker effort to enumerate some.
//
// Until we can really gate access to process we can't bound the amount
// of code we have to check to prevent
//   // Attacker controlled
//   let x = 'process', y = 'exit';
//   // Naive code
//   function f() { return this[x][y](); }
//   f();
//
// Properly gating that requires changing the meaning of `this` in
// non-strict function bodies which requires changing the current
// realm's global object.
//
// TODO: experiment with changing ../../.bin/node.d/node.patch to
// tweak all builtin modules that have `process` as a free variable
// to start with
//   const process = global[Symbol.from('process')];
// and the V8 bootstrap code to attach process there.
//
// Actually denying process to user code would require some kind of
// secret shared or closely held reference available only to builtin
// code.  The module loader that allows builtins access to lib/internal
// modules might server as the basis for getting such a secret from V8
// and conveying it to only builtin modules.
//
// But being able to mitigate any access via string keys would
// move an unmitigated process object out of the object graph
// reachable via substrings of network messages.

// GUARANTEE - global access to process is restricted to a whitelist
// of legacy modules.
// See require('../../package.json').sensitiveModules.process


// eslint-disable-next-line no-use-before-define
module.exports = lockdown;

const { apply } = Reflect;

const globalObject = global;

const {
  create,
  defineProperties,
  hasOwnProperty,
  getOwnPropertyDescriptors,
  getOwnPropertyNames,
  getOwnPropertySymbols,
} = Object;

const { exit } = require('process');
const { addHook } = require('pirates');
const delicateGlobalsRewrite = require('./delicate-globals-rewrite.js');

const languageIntrinsics = [
  /* eslint-disable array-element-newline */
  // Buffer is actually a Node builtin
  Array, ArrayBuffer, Boolean, Buffer, console, Date, EvalError, Error,
  Float32Array, Float64Array, Function, Int8Array, Int16Array, Int32Array,
  Intl, JSON, Object, Map, Math, Number, Promise, Proxy, RangeError,
  ReferenceError, Reflect, RegExp, Set, String, Symbol, SyntaxError, TypeError,
  URIError, Uint8Array, Uint16Array, Uint32Array, Uint8ClampedArray, WeakMap,
  WeakSet, global.WebAssembly,
  /* eslint-enable array-element-newline */
];

const doNotFreeze = {
  __proto__: null,
  Object: {
    __proto__: null,
    toString: true,
  },
};

const importantGlobalKeys = [ 'Infinity', 'NaN', 'global', 'GLOBAL', 'isFinite', 'isNaN', 'root', 'undefined' ];

function lockdownOwnPropertiesOf(obj, keys, whitelist) {
  const descriptors = getOwnPropertyDescriptors(obj);
  if (!keys) {
    // Subclassing code has to set constructor.
    // eslint-disable-next-line no-inner-declarations
    function isNonConstructorMethod(key) {
      return typeof descriptors[key].value === 'function' && key !== 'constructor';
    }
    keys = [ ...getOwnPropertyNames(descriptors), ...getOwnPropertySymbols(descriptors) ]
      .filter(isNonConstructorMethod);
  }
  const newDescriptors = create(null);
  for (let i = 0, len = keys.length; i < len; ++i) {
    const key = keys[i];
    const descriptor = descriptors[key];
    if (descriptor.configurable) {
      descriptor.configurable = false;
      if (apply(hasOwnProperty, descriptor, [ 'value' ]) &&
          !(whitelist && whitelist[key] === true)) {
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
    const whitelist = languageIntrinsic.name ? doNotFreeze[languageIntrinsic.name] : null;
    lockdownOwnPropertiesOf(languageIntrinsic, null, whitelist);
    if (typeof languageIntrinsic === 'function' && languageIntrinsic.prototype) {
      lockdownOwnPropertiesOf(languageIntrinsic.prototype, null, whitelist);
    }
    if (typeof languageIntrinsic === 'function' && languageIntrinsic.name &&
        globalObject[languageIntrinsic.name] === languageIntrinsic) {
      globalsToPin[globalsToPin.length] = languageIntrinsic.name;
    }
  }
  return globalsToPin;
}

function maskDelicateGlobals() {
  addHook(delicateGlobalsRewrite, { exts: [ '.js' ], ignoreNodeModules: false });
}

let lockeddown = false;
function lockdown() {
  if (lockeddown) {
    return;
  }
  lockeddown = true;

  try {
    const globalsToPin = [ ...importantGlobalKeys, ...lockdownIntrinsics() ];

    // Pin important globals in place.
    lockdownOwnPropertiesOf(globalObject, globalsToPin);

    maskDelicateGlobals();
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
