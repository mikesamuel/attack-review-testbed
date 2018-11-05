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

const now = Number(new Date('2018-10-22 12:00:00Z'));

// Logs in
// Drafts a post
// Uploads some images
// Previews the post.
// Commits
// Views the index page with the new post.
const indexRelUrl = `/?now=${ now }&offset=4`;

module.exports = {
  requests: (baseUrl, { isProduction }) => [
    // User logs in
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
      req: (lastResponse, { csrf }) => ({
        uri: new URL('/login', baseUrl).href,
        method: 'POST',
        form: {
          cont: '/',
          email: 'ada@example.com',
          _csrf: csrf,
        },
      }),
      res: {
        body: [ '' ],
        logs: {
          stderr: '',
          stdout: 'POST /login\n',
        },
        headers: {
          location: new URL('/', baseUrl).href,
        },
        statusCode: 302,
      },
    },
    // Later user visits a page that posts cross-origin.
    {
      req: {
        uri: new URL('/post', baseUrl).href,
        method: 'POST',
        formData: {
          body: 'Eat at Joe\'s!',
          'public': 'true',
          now,
        },
      },
      res: {
        body: [
          '<!DOCTYPE html>',
          '<html>',
          '<head>',
          '<title>Error</title>',
          '<script src="/common.js" nonce="xxxx1">',
          '</script>',
          '<link rel="stylesheet" href="/styles.css" nonce="xxxx1">',
          '</head>',
          '<body>',
          '<div class="userfloat">',
          '<a class="loginlink" href="/login">login</a>',
          (isProduction ?
            '</div>Something went wrong</body>' :
            '</div>Error: CSRF Token Not Found</body>'),
          '</html>',
        ],
        logs: {
          stderr: 'Error: CSRF Token Not Found\n',
          stdout: 'POST /post\n',
        },
        headers: {
          location: void 0,
        },
        statusCode: 500,
      },
    },
    {
      req: {
        uri: new URL(indexRelUrl, baseUrl).href,
      },
      res: {
        body: [
          '<!DOCTYPE html>',
          '<html>',
          '<head>',
          '<title>Attack Review Testbed</title>',
          '<script src="/common.js" nonce="xxxx2">',
          '</script>',
          '<link rel="stylesheet" href="/styles.css" nonce="xxxx2">',
          '</head>',
          '<body>',
          '<div class="userfloat">',
          '<span class="user name">Ada<a class="nounder" href="/account">&#9660;</a>',
          '</span>',
          `<form class="lightweight" action="/logout?cont=${ encodeURIComponent(indexRelUrl) }"` +
            ' method="POST" name="logout">',
          '<input name="_csrf" type="hidden" value="xxxx"/>',
          '<button class="logoutlink" type="submit">logout</button>',
          '</form>',
          '</div>',
          '<div class="banner view-as-public">',
          '</div>',
          '<h1>Recent Posts</h1>',
          '<ol class="posts">',
          '<li>',
          // Since offset is set, 1 post from canned data
          '<span class="author name">',
          '<a href="mailto:fae@fae.fae">',
          '<font color="green">Fae</font>',
          '</a>',
          '</span>',
          '<span class="created">a week ago</span>',
          '<div class="body">(It is probably insecure)</div>',
          '</li>',
          // No "Eat at Joe's" post.
          '</ol>',
          '</body>',
          '</html>',
        ],
        logs: {
          stdout: `GET ${ indexRelUrl }\n`,
        },
      },
    },

  ],
};
