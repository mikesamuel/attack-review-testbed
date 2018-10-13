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
 * Like performing `new Function(x)` to make sure that x is a valid JavaScript FunctionBody
 * and does not do anything like `}foo();(function(){` to break out of a function wrapper.
 */

'use strict';

const { isArray } = Array;
const { SyntaxError } = global;
const { parse } = require('@babel/parser');

module.exports = (code, sourceFilename) => {
  const ast = parse(`(function(){${ code }})`, { sourceFilename });
  if (ast.type === 'File') {
    const { program } = ast;
    if (program && program.type === 'Program') {
      const { body } = program;
      if (isArray(body) && body.length === 1) {
        const [ stmt ] = body;
        if (stmt.type === 'ExpressionStatement') {
          const { expression } = stmt;
          if (expression.type === 'FunctionExpression') {
            return;
          }
        }
      }
    }
  }
  throw new SyntaxError('Expected valid FunctionBody');
};
