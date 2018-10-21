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

const { createHash } = require('crypto');
// eslint-disable-next-line id-length
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const { expect } = require('chai');

const projectRoot = path.resolve(path.join(__dirname, '..', '..', '..'));

module.exports = {
  name: 'GET /post, POST /post, POST /post, GET /',
  requests: (baseUrl) => {
    // Logs in
    // Drafts a post
    // Uploads some images
    // Commits
    // Views the index page.
    const loginUrl = new URL('/login', baseUrl).href;
    const postUrl = new URL('/post', baseUrl).href;

    // eslint-disable-next-line quotes
    return [
      {
        req: {
          uri: loginUrl,
          method: 'POST',
          form: {
            cont: '/post',
            email: 'ada@example.com',
          },
        },
        res: {
          body: [ '' ],
          logs: {
            stderr: '',
            stdout: 'POST /login\n',
          },
          headers: {
            location: postUrl,
          },
          statusCode: 302,
        },
      },
      // Request a blank form.
      {
        req: {
          uri: postUrl,
        },
        res: {
          body: [
            '<!DOCTYPE html>',
            '<html>',
            '<head>',
            '<title>Attack Review Testbed</title>',
            '<script nonce="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx2" src="/common.js">',
            '</script>',
            '<link rel="stylesheet" href="/styles.css" nonce="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx2">',
            '</head>',
            '<body>',
            '<div class="userfloat">',
            '<span class="user name">Ada</span>',
            '<form class="lightweight" action="/logout?cont=%2Fpost" method="POST" name="logout">',
            '<button class="logoutlink" type="submit">logout</button>',
            '</form>',
            '</div>',
            '<h1>Preview</h1>',
            '<ol class="posts preview">',
            '<li>',
            // Use name shows here
            '<span class="author name">Ada</span>',
            '<span class="created">just now</span>',
            '<div class="body">',
            '</div>',
            '</li>',
            '</ol>',
            '<form id="post-form" action="/post" enctype="multipart/form-data" method="POST">',
            '<textarea name="body" cols="40" rows="5">',
            '</textarea>',
            '<div>',
            '<label for="public">Public</label>',
            '<input type="checkbox" id="public" name="public" value="1"/>',
            '</div>',
            '<div>',
            '</div>',
            '<br/>',
            '<input type="file" name="upload" multiple="multiple"/>',
            '<hr/>',
            '</form>',
            '<button type="submit" name="preview" value="1" form="post-form">Preview</button>',
            '<button type="submit" form="post-form">Post</button>',
            '<a href="/">',
            '<button type="button">Cancel</button>',
            '</a>',
            '<br/>',
            '</body>',
            '</html>',
          ],
          logs: {
            stdout: 'GET /post\n',
          },
          statusCode: 200,
        },
      },
      {
        req: {
          uri: postUrl,
          // At some point we have to POST to /post.
          method: 'POST',
          formData: {
            'body': 'Hello, <b>World</b>! <script>;</script>',
            'public': 'true',
            'preview': '1',
            'upload': [
              {
                value: fs.createReadStream(path.join(projectRoot, 'static', 'smiley.png')),
                options: {
                  filename: 'smiley0.png',
                  contentType: 'image/png',
                },
              },
              {
                value: fs.createReadStream(path.join(projectRoot, 'static', 'smiley.png')),
                options: {
                  filename: 'smiley1.png',
                  contentType: 'image/png',
                },
              },
            ],
          },
        },
        res: {
          body: [
            '<!DOCTYPE html>',
            '<html>',
            '<head>',
            '<title>Attack Review Testbed</title>',
            '<script nonce="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx3" src="/common.js">',
            '</script>',
            '<link rel="stylesheet" href="/styles.css" nonce="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx3">',
            '</head>',
            '<body>',
            '<div class="userfloat">',
            '<span class="user name">Ada</span>',
            '<form class="lightweight" action="/logout?cont=%2Fpost" method="POST" name="logout">',
            '<button class="logoutlink" type="submit">logout</button>',
            '</form>',
            '</div>',
            '<h1>Preview</h1>',
            '<ol class="posts preview">',
            '<li>',
            // Preview has author name
            '<span class="author name">Ada</span>',
            '<span class="created">just now</span>',
            // Content sanitized.
            '<div class="body">Hello, <b>World</b>! </div>',
            '<div class="images">',
            // Links to two image in preview.
            '<a class="usercontent" href="/user-uploads/000000000000000000000000.png">',
            '<img src="/user-uploads/000000000000000000000000.png"/>',
            '</a>',
            '<a class="usercontent" href="/user-uploads/000000000000000000000001.png">',
            '<img src="/user-uploads/000000000000000000000001.png"/>',
            '</a>',
            '</div>',
            '</li>',
            '</ol>',
            '<form id="post-form" action="/post" enctype="multipart/form-data" method="POST">',
            '<textarea name="body" cols="40" rows="5">' +
              // Unsanitized content in textarea
              'Hello, &lt;b&gt;World&lt;/b&gt;! &lt;script&gt;;&lt;/script&gt;' +
              '</textarea>',
            '<div>',
            '<label for="public">Public</label>',
            // Checkbox is now checked
            '<input type="checkbox" id="public" name="public" checked="checked" value="1"/>',
            '</div>',
            '<div>',
            '<div class="imagepreview">',
            // Uploads are now present as checkboxes.
            '<input id="image-0" type="checkbox" checked="checked" name="imagepath"' +
              ' value="/user-uploads/000000000000000000000000.png"/>',
            '<label for="image-0">',
            '<img class="usercontent" src="/user-uploads/000000000000000000000000.png"/>',
            '</label>',
            '</div>',
            '<div class="imagepreview">',
            '<input id="image-1" type="checkbox" checked="checked" name="imagepath"' +
              ' value="/user-uploads/000000000000000000000001.png"/>',
            '<label for="image-1">',
            '<img class="usercontent" src="/user-uploads/000000000000000000000001.png"/>',
            '</label>',
            '</div>',
            '</div>',
            '<br/>',
            '<input type="file" name="upload" multiple="multiple"/>',
            '<hr/>',
            '</form>',
            '<button type="submit" name="preview" value="1" form="post-form">Preview</button>',
            '<button type="submit" form="post-form">Post</button>',
            '<a href="/">',
            '<button type="button">Cancel</button>',
            '</a>',
            '<br/>',
            '</body>',
            '</html>',
          ],
          logs: {
            stdout: 'POST /post\n',
          },
        },
        after(response, body, { uploads }) { // eslint-disable-line no-unused-vars
          const uploadedFiles = Array.from(uploads.keys());
          // One for each file uploaded
          expect(uploadedFiles.length).to.equal(2);

          function hashOf(file) {
            const hash = createHash('sha256');
            // eslint-disable-next-line no-sync
            hash.update(fs.readFileSync(file));
            return hash.digest('hex');
          }

          const smileyHash = 'f0d865e578b3e8e725284fc9077a6450e31ed13e9a2bf014e25c361dc384faf2';
          for (const uploadedFileUrl of uploadedFiles) {
            expect(uploadedFileUrl).to.match(/^[/]user-uploads[/][^/]*$/);
            const uploadedFile = path.join(
              projectRoot, 'static', ...(uploadedFileUrl.split(/[/]/g).map(decodeURIComponent)));
            expect(hashOf(uploadedFile)).to.equal(smileyHash, uploadedFile);
          }
        },
      },
      // TODO: actually post the form
      // TODO: fetch the index form and see if the new post is there.  Maybe use ?limit to only fetch 2 posts.
    ];
  },
};
