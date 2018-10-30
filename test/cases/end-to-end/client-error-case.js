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

/* eslint array-element-newline: 0 */


const { URL } = require('url');

module.exports = {
  requests: (baseUrl) => [
    {
      req: {
        uri: new URL('/client-error', baseUrl).href,
        method: 'POST',
        headers: {
          'content-type': 'text/plain;charset=UTF-8',
        },
        body: 'Something happened\n  at foo.js\n  at bar.js',
        // No CSRF token
      },
      res: {
        body: 'IGNORE',
        logs: {
          stderr: '',
          stdout: (
            'POST /client-error\n' +
              'Client-error from <unknown>: Something happened\n' +
              '  |   at foo.js\n' +
              '  |   at bar.js\n'
          ),
        },
        statusCode: 200,
      },
    },
  ],
};
