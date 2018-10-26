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

// Test the login flow
// 1. Request the login page.
// 2. Submit the form with an email.
// 3. Redirect to a page and notice that the login link now has a username.

module.exports = {
  name: 'GET /login 200',
  requests: (baseUrl) => [
    {
      req: {
        uri: new URL('/login?cont=/echo', baseUrl).href,
        method: 'GET',
      },
      res: {
        body: [
          '<!DOCTYPE html>',
          '<html>',
          '<head>',
          '<title>Login</title>',
          '<script src="/common.js" nonce="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx1">',
          '</script>',
          '<link rel="stylesheet" href="/styles.css" nonce="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx1">',
          '</head>',
          '<body>',
          '<h1>Login</h1>',
          '<form method="POST" action="/login" id="login">',
          '<input name="_csrf" type="hidden" value="xxxx"/>',
          '<label for="email">Email</label>',
          '<input name="email"/>',
          `<input name="cont" type="hidden" value="${ baseUrl.origin }/echo"/>`,
          '<br/>There is no password input since testing a credential store',
          'is out of scope for this attack review, and requiring',
          'credentials or using a federated service like oauth would',
          'complicate running locally and testing as different users.</form>',
          '<br/>',
          '<button type="submit" form="login">Login</button>',
          `<a href="${ baseUrl.origin }/echo">`,
          '<button type="button">Cancel</button>',
          '</a>',
          '</body>',
          '</html>',
        ],
        logs: {
          stderr: '',
          stdout: 'GET /login?cont=/echo\n',
        },
        statusCode: 200,
      },
    },
    {
      req: (lastReponse, { csrf }) => ({
        uri: new URL('/login', baseUrl).href,
        form: {
          email: 'foo@bar.com',
          cont: `${ baseUrl.origin }/echo`,
          _csrf: csrf,
        },
        method: 'POST',
      }),
      res: {
        headers: {
          location: new URL('/echo', baseUrl).href,
        },
        body: [ '' ],
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
          '<script src="/common.js" nonce="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx4">',
          '</script>',
          '<link rel="stylesheet" href="/styles.css" nonce="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx4">',
          '</head>',
          '<body>',
          '<div class="userfloat">',
          '<span class="user name">Anonymous<a class="nounder" href="/account">&#9660;</a>',
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
  ],
};
