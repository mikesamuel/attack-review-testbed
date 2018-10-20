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
  name: 'POST /login, GET /echo, POST /logout, GET /echo OK',
  requests: (baseUrl) => {
    const echoUrl = new URL('/echo', baseUrl);
    const loginUrl = new URL('/login', baseUrl);
    const logoutUrl = new URL('/logout', baseUrl);

    return [
      {
        req: {
          uri: loginUrl,
          method: 'POST',
          form: {
            email: 'ada@example.com',
            cont: `${ baseUrl.origin }/echo`,
          },
        },
        res: {
          body: [ '' ],
          headers: {
            location: `${ baseUrl.origin }/echo`,
          },
          logs: {
            stderr: '',
            stdout: 'POST /login\n',
          },
          statusCode: 302,
        },
      },
      {
        req: {
          uri: echoUrl,
        },
        res: {
          body: [
            '<!DOCTYPE html>',
            '<html>',
            '<head>',
            '<title>Database Echo</title>',
            '<script nonce="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx2" src="/common.js">',
            '</script>',
            '<link rel="stylesheet" href="/styles.css" nonce="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx2">',
            '</head>',
            '<body>',
            '<div class="userfloat">',
            // Got user name.  See db-tables.js
            '<span class="user name">Ada</span>',
            '<form class="lightweight" action="/logout?cont=%2Fecho" method="POST">',
            '<button class="logoutlink" type="submit">logout</button>',
            '</form>',
            '</div>',
            '<h1>Echo</h1>',
            '<table class="echo">',
            '<tr>',
            '<th>Hello</th>',
            '</tr>',
            '<tr>',
            '<td>World</td>',
            '</tr>',
            '</table>',
            '</body>',
            '</html>',
          ],
          logs: {
            stderr: '',
            stdout: 'GET /echo\necho sending SELECT \'World\' AS "Hello"\n',
          },
          statusCode: 200,
        },
      },
      {
        req: {
          uri: logoutUrl,
          headers: {
            Referer: `${ baseUrl.origin }/echo`,
          },
          method: 'POST',
        },
        res: {
          body: [ '' ],
          headers: {
            location: `${ baseUrl.origin }/echo`,
          },
          logs: {
            stderr: '',
            stdout: 'POST /logout\n',
          },
          statusCode: 302,
        },
      },
      {
        req: {
          uri: echoUrl,
        },
        res: {
          body: [
            '<!DOCTYPE html>',
            '<html>',
            '<head>',
            '<title>Database Echo</title>',
            '<script nonce="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx4" src="/common.js">',
            '</script>',
            '<link rel="stylesheet" href="/styles.css" nonce="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx4">',
            '</head>',
            '<body>',
            '<div class="userfloat">',
            // No user name.
            '<a class="loginlink" href="/login">login</a>',
            '</div>',
            '<h1>Echo</h1>',
            '<table class="echo">',
            '<tr>',
            '<th>Hello</th>',
            '</tr>',
            '<tr>',
            '<td>World</td>',
            '</tr>',
            '</table>',
            '</body>',
            '</html>',
          ],
          logs: {
            stderr: '',
            stdout: 'GET /echo\necho sending SELECT \'World\' AS "Hello"\n',
          },
          statusCode: 200,
        },
      },
    ];
  },
};

