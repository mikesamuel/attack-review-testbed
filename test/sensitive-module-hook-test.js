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

const { makeHook } = require('../lib/framework/module-hooks/sensitive-module-hook.js');
const { runHook } = require('./run-hook.js');

describe('sensitive-module-hook', () => {
  const config = {
    'child_process': {
      'advice': 'Try to use safe/child_process instead.  If that doesn\'t work, ask @security-oncall',
      'ids': [ './may-use-childprocess.js' ],
    },
    'fs': null,
    './unsafe.js': './may-use-unsafe.js',
  };
  describe('reportOnly', () => {
    const hook = makeHook(config, __dirname, true);
    describe('builtin', () => {
      it('allowed', () => {
        expect(runHook(hook, 'may-use-childprocess.js', 'child_process'))
          .to.deep.equal({
            result: 'child_process',
            stdout: '',
            stderr: '',
          });
      });
      it('disallowed', () => {
        expect(runHook(hook, 'unsafe.js', 'child_process'))
          .to.deep.equal({
            result: 'child_process',
            stderr: (
              '../lib/framework/module-hooks/sensitive-module-hook.js:' +
              ' Blocking require("child_process") by unsafe.js\n' +
              '\tTry to use safe/child_process instead.  If that doesn\'t work, ask @security-oncall\n'),
            stdout: '',
          });
      });
      it('not sensitive', () => {
        expect(runHook(hook, 'may-use-childprocess.js', 'path'))
          .to.deep.equals({
            result: 'path',
            stderr: '',
            stdout: '',
          });
      });
    });
    describe('user module', () => {
      it('allowed', () => {
        expect(runHook(hook, 'may-use-unsafe.js', './unsafe.js'))
          .to.deep.equals({
            result: './unsafe.js',
            stderr: '',
            stdout: '',
          });
      });
      it('disallowed', () => {
        expect(runHook(hook, 'unsafe.js', './unsafe.js'))
          .to.deep.equals({
            result: './unsafe.js',
            stderr: (
              '../lib/framework/module-hooks/sensitive-module-hook.js:' +
              ' Blocking require("./unsafe.js") by unsafe.js\n'),
            stdout: '',
          });
      });
      it('no such file', () => {
        expect(() => runHook(hook, 'may-use-childprocess.js', './no-such-file.js'))
          .to.throw(Error, 'Cannot find module \'./no-such-file.js\'');
      });
      it('not sensitive', () => {
        expect(runHook(hook, 'may-use-childprocess.js', './ok.js'))
          .to.deep.equals({
            result: './ok.js',
            stdout: '',
            stderr: '',
          });
      });
    });
  });
  describe('active', () => {
    const hook = makeHook(config, __dirname, false);
    describe('builtin', () => {
      it('allowed', () => {
        expect(runHook(hook, 'may-use-childprocess.js', 'child_process'))
          .to.deep.equal({
            result: 'child_process',
            stdout: '',
            stderr: '',
          });
      });
      it('disallowed', () => {
        expect(runHook(hook, 'unsafe.js', 'child_process'))
          .to.deep.equal({
            result: require.resolve('../lib/framework/module-hooks/innocuous.js'),
            stderr: (
              '../lib/framework/module-hooks/sensitive-module-hook.js:' +
              ' Blocking require("child_process") by unsafe.js\n' +
              '\tTry to use safe/child_process instead.  If that doesn\'t work, ask @security-oncall\n'),
            stdout: '',
          });
      });
      it('disallowed no list', () => {
        expect(runHook(hook, 'unsafe.js', 'fs'))
          .to.deep.equal({
            result: require.resolve('../lib/framework/module-hooks/innocuous.js'),
            stderr: (
              '../lib/framework/module-hooks/sensitive-module-hook.js:' +
              ' Blocking require("fs") by unsafe.js\n'),
            stdout: '',
          });
      });
      it('not sensitive', () => {
        expect(runHook(hook, 'may-use-childprocess.js', 'path'))
          .to.deep.equals({
            result: 'path',
            stderr: '',
            stdout: '',
          });
      });
    });
    describe('user module', () => {
      it('allowed', () => {
        expect(runHook(hook, 'may-use-unsafe.js', './unsafe.js'))
          .to.deep.equals({
            result: './unsafe.js',
            stderr: '',
            stdout: '',
          });
      });
      it('disallowed', () => {
        expect(runHook(hook, 'unsafe.js', './unsafe.js'))
          .to.deep.equals({
            result: require.resolve('../lib/framework/module-hooks/innocuous.js'),
            stderr: (
              '../lib/framework/module-hooks/sensitive-module-hook.js:' +
              ' Blocking require("./unsafe.js") by unsafe.js\n'),
            stdout: '',
          });
      });
      it('no such file', () => {
        expect(() => runHook(hook, 'may-use-childprocess.js', './no-such-file.js'))
          .to.throw(Error, 'Cannot find module \'./no-such-file.js\'');
      });
      it('not sensitive', () => {
        expect(runHook(hook, 'may-use-childprocess.js', './ok.js'))
          .to.deep.equals({
            result: './ok.js',
            stdout: '',
            stderr: '',
          });
      });
    });
  });
});
