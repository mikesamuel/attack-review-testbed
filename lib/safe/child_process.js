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
 * Wraps child_process to check shell strings.
 *
 * This provides a subset of an API equivalent to child_process, but where
 * command string, command, and argument values must be *ShFragment*s.
 *
 * The subset of the `child_process` API may be expanded as needed.
 */

// SENSITIVE - Trusted to spawn child processes.
// GUARANTEE - Only allows execution of commands that were created by an
//   approved ShFragment minter.

'use strict'; // eslint-disable-line filenames/match-regex

const childProcess = require('child_process');
const { ShFragment } = require('sh-template-tag');
const { Mintable } = require('node-sec-patterns');
const { inspect } = require('util');

const isShFragment = Mintable.verifierFor(ShFragment);

module.exports.exec = (...args) => {
  let [ command ] = args;

  if (!isShFragment(command)) {
    throw new TypeError(`exec expected an ShFragment, not ${ inspect(command) }
Maybe use require('sh-template-tag').sh\`...\` to create a command string.`);
  }
  command = command.content;

  let options = null;
  let onExit = null;

  switch (args.length) {
    case 1:
      break;
    case 2: {
      const [ , arg ] = args;
      if (arg) {
        if (typeof arg === 'function') {
          onExit = arg;
        } else if (typeof args[1] === 'object') {
          options = arg;
        } else {
          throw new Error('invalid argument');
        }
      }
      break;
    }
    case 3: // eslint-disable-line no-magic-numbers
      [ , options, onExit ] = args;
      break;
    default:
      throw new Error('wrong number of arguments');
  }

  options = options || {};

  if (onExit) {
    return childProcess.exec(command, options, onExit);
  }
  return childProcess.exec(command, options);
};
