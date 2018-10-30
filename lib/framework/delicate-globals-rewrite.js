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
 * Lots of builtin code requires the global process variable.
 * Virtualizing it would slow that code down.
 * Instrumenting every non-builtin source file is actually the most
 * efficient way to deny user code to silently access process.
 *
 * Some code needs to legitimately use `new Function`, but the node
 * runtime does not use a V8 version with a sufficiently flexible
 * allow_code_generation_from_string callback API like V8 3.7 does.
 * We can proxy Function to instead use the vm module to load code
 * when there are explicit calls, and then use module whitelisting
 * to gate access to the vm module.
 *
 * This module provides a (code,filename)->code transform that does both.
 */

// SENSITIVE - receives privileged require function.

// eslint-disable-next-line no-use-before-define
module.exports = rewriteCode;

const { fromCharCode } = String;
const { create, defineProperty } = Object;
const { randomBytes } = require('crypto');
const codeLoadingFunctionProxy = require('./code-loading-function-proxy.js');
const wellFormednessCheck = require('./well-formedness-check.js');
const unprivilegedRequire = require('./unprivileged-require.js');

function rewriteCode(code, filename, fallbackRequire = unprivilegedRequire) {
  code = `${ code }`;
  const decoded = code.replace(
    /\\u([0-9A-Fa-f]{4})/g,
    // eslint-disable-next-line no-magic-numbers
    (whole, hex) => fromCharCode(parseInt(hex, 16)));

  const masks = [];

  // On first reference to Function, load one that uses this module's require to load code via vm.
  // This lets us deny implicit calls to the Function constructor.
  // Mask Function if it seems to be used as a constructor intentionally.
  if (/\bFunction\s*\(/.test(decoded)) {
    masks[masks.length] = (localRequire, mask) => {
      let fun = null;
      defineProperty(
        mask,
        'Function',
        {
          get() {
            const req = localRequire || fallbackRequire;
            return fun || (fun = codeLoadingFunctionProxy(req, filename));
          },
        });
    };
  }

  // Mask process
  if (/process(?!\w)/.test(decoded)) {
    // TODO: get a process mask value that encapsulates module identity by passing require
    // to a module that returns a masking value.

    // Add a single use non-enumerable global so that two modules can't
    // conspire by having an early loading one compute a hash for a late
    // loading one.
    // eslint-disable-next-line no-magic-numbers
    masks[masks.length] = (localRequire, mask) => {
      let proc = null;
      defineProperty(
        mask,
        'process',
        {
          get() {
            const req = localRequire || fallbackRequire;
            return proc || (proc = req('process'));
          },
        });
    };
  }

  if (masks.length) {
    const [ , header, rest ] = /^((?:#[^\n\r\u2028\u2029]*[\n\r\u2028\u2029]*)?)([\s\S]*)$/.exec(code);
    wellFormednessCheck(rest, filename);

    // eslint-disable-next-line no-magic-numbers
    const maskId = `_mask${ randomBytes(16).toString('hex') }`;
    defineProperty(
      global,
      maskId,
      {
        value: (localRequire) => {
          const mask = create(null);
          for (const masker of masks) {
            masker(localRequire, mask);
          }
          return mask;
        },
      });

    const before = `with (${ maskId }(typeof require !== 'undefined' ? require : null)) {`;
    const after = '}';

    // Preserve line numbers while creating treating rest as a FunctionBody that might have its own
    // PrologueDeclarations.
    return `${ header }${ before } return (() => { ${ rest } })(); ${ after }`;
  }

  return code;
}
