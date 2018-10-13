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
const { interceptStderr, interceptStdout } = require('capture-console');

function runHook(hook, source, target) {
  const sourceId = module.id.replace(/[^/]+\/[^/]+$/, source);
  const sourceFile = path.join(__dirname, source);

  if (typeof hook.flush === 'function') {
    hook.flush();
  }

  const sentinel = {};
  let thrown = sentinel;
  let result = null;
  let stdout = null;
  const stderr = interceptStderr(() => {
    stdout = interceptStdout(() => {
      try {
        result = hook(sourceFile, sourceId, target, require.resolve);
      } catch (exc) {
        thrown = exc;
      } finally {
        if (typeof hook.flush === 'function') {
          hook.flush();
        }
      }
    });
  });
  if (thrown !== sentinel) {
    throw thrown;
  }
  return { result, stderr, stdout };
}

module.exports = { runHook };
