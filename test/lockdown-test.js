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

const { expect } = require('chai');
const { describe, it } = require('mocha');
const lockdown = require('../lib/framework/lockdown.js');

function withSubst(rootObj, properties, substitute, blockFn) {
  let obj = rootObj;
  const { length } = properties;
  const lastProperty = properties[length - 1];
  for (let i = 0; i < length - 1; ++i) {
    obj = obj[properties[i]];
  }
  const original = obj[lastProperty];
  try {
    obj[lastProperty] = substitute;
  } catch (exc) {
    return blockFn();
  }
  try {
    return blockFn();
  } finally {
    obj[lastProperty] = original;
  }
}

function noop() {
  // This block left intentionally blank.
}

describe('lockdown', () => {
  lockdown();

  it('reliable path to Function.prototype.call', () => {
    expect(
      withSubst(
        Function, [ 'prototype', 'call' ], noop,
        () => {
          let callCount = 0;
          function fun() {
            ++callCount;
          }
          fun.call();
          return callCount;
        }))
      .to.equal(1);
  });
  it('arrays still mutable', () => {
    // eslint-disable-next-line no-magic-numbers
    const arr = [ 0, 1, 2, 3, 4, 5 ];
    arr.length = 3;
    expect(arr).to.deep.equals([ 0, 1, 2 ]);
  });
  it('String replace', () => {
    expect(
      withSubst(
        String, [ 'prototype', 'replace' ], () => 'foo',
        () => 'bar'.replace(/[a-z]/g, '$&.')))
      .to.equal('b.a.r.');
  });
  it('process not entirely unchecked', () => {
    expect(global.process instanceof Object).to.equal(true);

    const unprivilegedRequireModule = require.cache[require.resolve(
      '../lib/framework/unprivileged-require.js')];
    expect(unprivilegedRequireModule.parent.id).to.equal(
      require.resolve('../lib/framework/delicate-globals-rewrite.js'));
  });
});
