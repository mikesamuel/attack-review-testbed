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

const path = require('path');
const { expect } = require('chai');
const { describe, it } = require('mocha');

const { makeHook } = require('../lib/framework/module-hooks/resource-integrity-hook.js');
const { runHook } = require('./run-hook.js');

const basedir = path.resolve(path.join(__dirname, '..'));

describe('resource-integrity-hook', () => {
  const config = {
    // As reported by `shasum -a 256 test/file-with-known-hash.js`
    '9c7bbbbab6d0bdaf8ab15a94f42324488280e47e1531a218e687b95d30bf376d': [ 'test/file-with-known-hash.js' ],
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa': [ 'test/file-with-wrong-hash.js' ],
  };
  describe('reportOnly', () => {
    const hook = makeHook(config, basedir, true);
    it('match', () => {
      const target = './file-with-known-hash.js';
      const { result, stdout, stderr } = runHook(hook, 'source.js', target);
      expect(result).to.equal(target);
      expect(stderr).to.equal('', 'stderr');
      expect(stdout).to.equal('', 'stdout');
    });
    it('mismatch', () => {
      const target = './file-with-wrong-hash.js';
      const { result, stdout, stderr } = runHook(hook, 'source.js', target);
      expect(result).to.equal(target);
      expect(stderr).to.equal(
        'lib/framework/module-hooks/resource-integrity-hook.js: ' +
        'Blocking require("./file-with-wrong-hash.js") ' +
        'by test/source.js\n',
        'stderr');
      expect(stdout).to.equal('', 'stdout');
    });
    it('404', () => {
      const target = './no-such-file.js';
      const { result, stdout, stderr } = runHook(hook, 'source.js', target);
      expect(result).to.equal(target);
      expect(stderr).to.equal(
        'lib/framework/module-hooks/resource-integrity-hook.js: ' +
        'Blocking require("./no-such-file.js") ' +
        'by test/source.js\n',
        'stderr');
      expect(stdout).to.equal('', 'stdout');
    });
  });
  describe('active', () => {
    const hook = makeHook(config, basedir, false);
    it('match', () => {
      const target = './file-with-known-hash.js';
      const { result, stdout, stderr } = runHook(hook, 'source.js', target);
      expect(result).to.equal(target);
      expect(stderr).to.equal('', 'stderr');
      expect(stdout).to.equal('', 'stdout');
    });
    it('mismatch', () => {
      const target = './file-with-wrong-hash.js';
      const { result, stdout, stderr } = runHook(hook, 'source.js', target);
      expect(path.basename(result)).to.equal('innocuous.js');
      expect(stderr).to.equal(
        'lib/framework/module-hooks/resource-integrity-hook.js: ' +
        'Blocking require("./file-with-wrong-hash.js") ' +
        'by test/source.js\n',
        'stderr');
      expect(stdout).to.equal('', 'stdout');
    });
    it('404', () => {
      const target = './no-such-file.js';
      const { result, stdout, stderr } = runHook(hook, 'source.js', target);
      expect(path.basename(result)).to.equal('innocuous.js');
      expect(stderr).to.equal(
        'lib/framework/module-hooks/resource-integrity-hook.js: ' +
        'Blocking require("./no-such-file.js") ' +
        'by test/source.js\n',
        'stderr');
      expect(stdout).to.equal('', 'stdout');
    });
  });
});
