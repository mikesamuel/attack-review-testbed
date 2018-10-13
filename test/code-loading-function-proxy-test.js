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

/* eslint no-magic-numbers: 0 */

'use strict';

const { expect } = require('chai');
const { describe, it } = require('mocha');
const Fun = require('../lib/framework/code-loading-function-proxy.js')(require);

describe('code-loading-function-proxy', () => {
  it('empty', () => {
    expect(() => Fun()).to.not.throw();
    expect(() => Fun('')).to.not.throw();
  });
  it('typeof', () => {
    expect(() => Fun()).to.not.throw();
    expect(() => Fun('')).to.not.throw();
  });
  it('consts', () => {
    expect(Fun('return 1 + 1')()).to.equal(2);
    expect(new Fun('return 1 + 1')()).to.equal(2);
  });
  it('noreturn', () => {
    expect(Fun('1 + 1')()).to.equal(void 0);
  });
  it('params', () => {
    expect(Fun('a', 'b', 'return a + b')('foo', 'bar')).to.equal('foobar');
    expect(Fun('x', 'y', 'return x + y')(3, 4)).to.equal(7);
  });
  it('invalid body', () => {
    expect(() => Fun('}, function () {')).to.throw(SyntaxError);
  });
  it('invalid params', () => {
    expect(() => Fun('', '')).to.throw(SyntaxError);
    expect(() => Fun('1', '')).to.throw(SyntaxError);
    expect(() => Fun('1a', '')).to.throw(SyntaxError);
    expect(() => Fun('a-b', '')).to.throw(SyntaxError);
    expect(() => Fun('return', '')).to.throw();
  });
  it('flexible params', () => {
    expect(
      Fun(
        '_a', 'b0', '\\u0041', '\u03b1',
        'return _a + b0 + \u0041 + \u03b1'
      )(1, 2, 3, 4))
      .to.equal(10);
  });
  it('nested', () => {
    expect(Fun('return new Function("return 1 + 1")()')()).to.equal(2);
  });
  it('this', () => {
    const sentinel = {};
    expect(Fun('return this').call(sentinel)).to.equal(sentinel);
  });
});
