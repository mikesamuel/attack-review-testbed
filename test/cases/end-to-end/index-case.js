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
  name: 'GET / OK',
  requests: (baseUrl) => {
    const now = Number(new Date('2018-10-12 12:00:00Z'));
    const homePagePath = `/?now=${ now }`;
    return [
      {
        req: {
          uri: new URL(homePagePath, baseUrl).href,
          method: 'GET',
        },
        res: {
          body: [
            '<!DOCTYPE html>',
            '<html>',
            '<head>',
            '<title>Attack Review Testbed</title>',
            '<script nonce="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx0" src="/common.js">',
            '</script>',
            '<link rel="stylesheet" href="/styles.css" nonce="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx0">',
            '</head>',
            '<body>',
            '<div class="userfloat">',
            '<a class="loginlink" href="/login">login</a>',
            '</div>',
            '<div class="banner view-as-public">',
            '</div>',
            '<h1>Recent Posts</h1>',
            '<ol class="posts">',
            '<li>',
            '<span class="author name">Ada</span>',
            '<span class="created">a week ago</span>',
            '<div class="body">Hi!  My name is <b>Ada</b>.  Nice to meet you!</div>',
            '<div class="images">',
            '<a class="usercontent" href="smiley.png">',
            '<img src="smiley.png"/>',
            '</a>',
            '</div>',
            '</li>',
            '<li>',
            '<span class="author name">',
            '<a href="about:invalid#TrustedURL">Bob</a>',
            '</span>',
            '<span class="created">6 days ago</span>',
            '<div class="body">Ada, !</div>',
            '</li>',
            '<li>',
            '<span class="author name">',
            '<a href="https://deb.example.com/">',
            '<b>D</b>eb</a>',
            '</span>',
            '<span class="created">5 days ago</span>',
            '<div class="body">',
            '<b>¡Hi, all!</b>',
            '</div>',
            '</li>',
            '<li>',
            '<span class="author name">',
            '<a href="mailto:fae@fae.fae">',
            '<font color="green">Fae</font>',
            '</a>',
            '</span>',
            '<span class="created">3 days ago</span>',
            '<div class="body">Sigh!  Yet another <a href="//Facebook.com">Facebook.com</a>' +
              ' knockoff without any users.</div>',
            '</li>',
            '<li>',
            '<span class="author name">',
            '<a href="mailto:fae@fae.fae">',
            '<font color="green">Fae</font>',
            '</a>',
            '</span>',
            '<span class="created">2 days ago</span>',
            '<div class="body">(It is probably insecure)</div>',
            '</li>',
            '</ol>',
            '</body>',
            '</html>',
          ],
          logs: {
            stderr: '',
            stdout: `GET ${ homePagePath }\n`,
          },
          statusCode: 200,
        },
      },
    ];
  },
};
