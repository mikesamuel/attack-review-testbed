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
  requests: (baseUrl) => [
    {
      req: {
        uri: new URL('/login', baseUrl).href,
      },
      res: {
        body: 'IGNORE',
        logs: {
          stderr: '',
          stdout: 'GET /login\n',
        },
        statusCode: 200,
      },
    },
    {
      req: (lastReponse, { csrf }) => ({
        uri: new URL('/login', baseUrl).href,
        method: 'POST',
        form: {
          _csrf: csrf,
          email: 'ada@example.com',
          cont: `${ baseUrl.origin }/echo`,
        },
      }),
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
        uri: new URL('/echo', baseUrl).href,
      },
      res: {
        body: [
          '<!DOCTYPE html>',
          '<html>',
          '<head>',
          '<title>Database Echo</title>',
          '<script src="/common.js" nonce="xxxx1">',
          '</script>',
          '<link rel="stylesheet" href="/styles.css" nonce="xxxx1">',
          '</head>',
          '<body>',
          '<div class="userfloat">',
          // Got user name.  See db-tables.js
          '<span class="user name">Ada<a class="nounder" href="/account">&#9660;</a>',
          '</span>',
          '<form class="lightweight" action="/logout?cont=%2Fecho" method="POST" name="logout">',
          '<input name="_csrf" type="hidden" value="xxxx"/>',
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
      req: (lastReponse, { csrf }) => ({
        uri: new URL('/logout', baseUrl).href,
        headers: {
          Referer: `${ baseUrl.origin }/echo`,
        },
        method: 'POST',
        form: {
          _csrf: csrf,
        },
      }),
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
        uri: new URL('/echo', baseUrl).href,
      },
      res: {
        body: [
          '<!DOCTYPE html>',
          '<html>',
          '<head>',
          '<title>Database Echo</title>',
          '<script src="/common.js" nonce="xxxx2">',
          '</script>',
          '<link rel="stylesheet" href="/styles.css" nonce="xxxx2">',
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
  ],
};
