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

/**
 * @fileoverview
 * Provide a proxy that looks like `Function` and that, when used as a
 * constructor, behaves like `new Function` but without triggering V8's
 * allow_code_gen_callback.
 *
 * See lockdown.js for the code that introduces this code.
 */

'use strict';

// SENSITIVE - Invokes vm to load code from strings.

// eslint-disable-next-line no-use-before-define
module.exports = makeProxy;

const { Function } = global;

const wellFormednessCheck = require('./well-formedness-check.js');
const paramPattern = /^(?:[_$A-Z\x80-\uFFFF]|\\u[0-9A-F]{4})(?:[_$0-9A-Z\x80-\uFFFF]|\\u[0-9A-F]{4})*$/i;
const delicateGlobalsRewrite = require('./delicate-globals-rewrite.js');

function makeProxy(localRequire, filename) {
  // Use the requesters require function to give sensitive-module-hook
  // enough context to decide whether to allow access to vm.
  const { runInThisContext } = localRequire('vm');

  const fun = new Proxy(
    Function,
    {
      apply(target, thisArg, argumentsList) {
        // eslint-disable-next-line no-use-before-define
        return loadCode(argumentsList);
      },
      construct(target, argumentsList) {
        // eslint-disable-next-line no-use-before-define
        return loadCode(argumentsList);
      },
    });

  function loadCode(argumentList) {
    const formals = [];
    let body = '';
    const nFormals = argumentList.length - 1;
    for (let i = 0; i < nFormals; ++i) {
      const paramName = `${ argumentList[i] }`;
      if (paramPattern.test(paramName)) {
        formals.push(paramName);
      } else {
        throw new SyntaxError(`Invalid param name: ${ paramName }`);
      }
    }
    body = (nFormals >= 0 && `${ argumentList[nFormals] }`) || '';
    //   new Function(code)
    // is an idiom used to check that code has no side-effects until
    // applied.
    wellFormednessCheck(body);

    const evalFilename = `eval:${ filename }`;

    const rewrittenBody = delicateGlobalsRewrite(body, evalFilename, localRequire);

    const code = `(function (${ formals.join(', ') }){ ${ rewrittenBody } })`;

    return runInThisContext(
      code,
      {
        filename: evalFilename,
        displayErrors: true,
      });
  }

  return fun;
}
