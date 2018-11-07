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

const tEarly = Number(new Date('2018-10-22 12:00:00Z'));
const tLater = Number(new Date('2018-10-22 12:05:00Z'));

// Logs in
// Drafts a public post
// Uploads some images
// Previews the post.
// Commits
// Views the index page with the new post.
// Drafts a private post and commits it.
// Views the index page with both posts.
// TODO: Logs out.
// TODO: Only sees the public post.
// TODO: Logs in as a friend.
// TODO: Sees both posts.

function indexRelUrl(now) {
  return `/?now=${ now }&offset=4`;
}

module.exports = {
  requests: (baseUrl, { root: projectRoot }) => {
    // Store map with randomly generated filenames so we can test stability over
    // multiple POSTS.
    let filenameMapFromUploadPost = null;
    return [
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
            cont: '/post',
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
            location: new URL('/post', baseUrl).href,
          },
          statusCode: 302,
        },
      },
      // Request a blank form.
      {
        req: {
          uri: `${ baseUrl.origin }/post?now=${ tEarly }`,
        },
        res: {
          body: [
            '<!DOCTYPE html>',
            '<html>',
            '<head>',
            '<title>New Post</title>',
            '<script src="/common.js" nonce="xxxx1">',
            '</script>',
            '<link rel="stylesheet" href="/styles.css" nonce="xxxx1">',
            '</head>',
            '<body>',
            '<div class="userfloat">',
            '<span class="user name">Ada<a class="nounder" href="/account">&#9660;</a>',
            '</span>',
            '<form class="lightweight"' +
              ` action="/logout?cont=%2Fpost%3Fnow%3D${ tEarly }" method="POST" name="logout">`,
            '<input name="_csrf" type="hidden" value="xxxx"/>',
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
            '<input name="_csrf" type="hidden" value="xxxx"/>',
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
            `<input type="hidden" name="now" value="${ tEarly }"/>`,
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
            stdout: `GET /post?now=${ tEarly }\n`,
          },
          statusCode: 200,
        },
      },
      {
        req: (lastResponse, { csrf }) => ({
          uri: new URL('/post', baseUrl).href,
          // At some point we have to POST to /post.
          method: 'POST',
          formData: {
            body: 'Hello, <b>World</b>! <script>;</script>',
            _csrf: csrf,
            'public': 'true',
            preview: '1',
            upload: [
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
            now: tEarly,
          },
        }),
        res: {
          body: [
            '<!DOCTYPE html>',
            '<html>',
            '<head>',
            '<title>New Post</title>',
            '<script src="/common.js" nonce="xxxx2">',
            '</script>',
            '<link rel="stylesheet" href="/styles.css" nonce="xxxx2">',
            '</head>',
            '<body>',
            '<div class="userfloat">',
            '<span class="user name">Ada<a class="nounder" href="/account">&#9660;</a>',
            '</span>',
            '<form class="lightweight"' +
              ' action="/logout?cont=%2Fpost" method="POST" name="logout">',
            '<input name="_csrf" type="hidden" value="xxxx"/>',
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
            '<a class="usercontent" href="/user-uploads/00000000000000000000000000000000.png">',
            '<img src="/user-uploads/00000000000000000000000000000000.png"/>',
            '</a>',
            '<a class="usercontent" href="/user-uploads/00000000000000000000000000000001.png">',
            '<img src="/user-uploads/00000000000000000000000000000001.png"/>',
            '</a>',
            '</div>',
            '</li>',
            '</ol>',
            '<form id="post-form" action="/post" enctype="multipart/form-data" method="POST">',
            '<input name="_csrf" type="hidden" value="xxxx"/>',
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
              ' value="/user-uploads/00000000000000000000000000000000.png"/>',
            '<label for="image-0">',
            '<img class="usercontent" src="/user-uploads/00000000000000000000000000000000.png"/>',
            '</label>',
            '</div>',
            '<div class="imagepreview">',
            '<input id="image-1" type="checkbox" checked="checked" name="imagepath"' +
              ' value="/user-uploads/00000000000000000000000000000001.png"/>',
            '<label for="image-1">',
            '<img class="usercontent" src="/user-uploads/00000000000000000000000000000001.png"/>',
            '</label>',
            '</div>',
            '</div>',
            '<br/>',
            '<input type="file" name="upload" multiple="multiple"/>',
            `<input type="hidden" name="now" value="${ tEarly }"/>`,
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

          filenameMapFromUploadPost = Array.from(uploads.entries());
        },
      },
      {
        // actually commit the post
        req: (lastResponse, { csrf, uploads }) => ({
          uri: new URL('/post', baseUrl).href,
          method: 'POST',
          formData: {
            body: 'Hello, <b>World</b>! <script>;</script>',
            _csrf: csrf,
            'public': 'true',
            // No preview input.
            imagepath: Array.from(uploads.keys()),
            now: tEarly,
          },
        }),
        res: {
          body: [ 'Posted' ],
          headers: {
            location: '/',
          },
          logs: {
            stdout: 'POST /post\n',
          },
          statusCode: 302,
        },
      },
      {
        req: {
          uri: new URL(indexRelUrl(tEarly), baseUrl).href,
        },
        res: {
          body: [
            '<!DOCTYPE html>',
            '<html>',
            '<head>',
            '<title>Attack Review Testbed</title>',
            '<script src="/common.js" nonce="xxxx3">',
            '</script>',
            '<link rel="stylesheet" href="/styles.css" nonce="xxxx3">',
            '</head>',
            '<body>',
            '<div class="userfloat">',
            '<span class="user name">Ada<a class="nounder" href="/account">&#9660;</a>',
            '</span>',
            `<form class="lightweight" action="/logout?cont=${ encodeURIComponent(indexRelUrl(tEarly)) }"` +
              ' method="POST" name="logout">',
            '<input name="_csrf" type="hidden" value="xxxx"/>',
            '<button class="logoutlink" type="submit">logout</button>',
            '</form>',
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
            // The new post
            '<li>',
            '<span class="author name">Ada</span>',
            '<span class="created">just now</span>',
            // Sanitized body content
            '<div class="body">Hello, <b>World</b>! </div>',
            '<div class="images">',
            // Images
            '<a class="usercontent" href="/user-uploads/00000000000000000000000000000000.png">',
            '<img src="/user-uploads/00000000000000000000000000000000.png"/>',
            '</a>',
            '<a class="usercontent" href="/user-uploads/00000000000000000000000000000001.png">',
            '<img src="/user-uploads/00000000000000000000000000000001.png"/>',
            '</a>',
            '</div>',
            '</li>',
            '</ol>',
            '<div>',
            '<a href="/post">',
            '<button type="button">+ New Post</button>',
            '</a>',
            '</div>',
            '</body>',
            '</html>',
          ],
          logs: {
            stdout: `GET ${ indexRelUrl(tEarly) }\n`,
          },
        },
        after(response, body, { uploads }) {
          expect(Array.from(uploads.entries())).to.deep.equal(filenameMapFromUploadPost);
        },
      },
      {
        // request a blank post form with a fresh CSRF token.
        req: {
          uri: `${ baseUrl.origin }/post?now=${ tLater }`,
        },
        res: {
          body: 'IGNORE',
          logs: {
            stdout: `GET /post?now=${ tLater }\n`,
          },
          statusCode: 200,
        },
      },
      {
        // commit a non-public post
        req: (lastResponse, { csrf }) => ({
          uri: new URL('/post', baseUrl).href,
          method: 'POST',
          formData: {
            body: 'This message will self-destruct in 10 seconds.<script>setTimeout(selfDestruct, 10000)</script>',
            _csrf: csrf,
            imagepath: [],
            now: tLater,
          },
        }),
        res: {
          body: [ 'Posted' ],
          headers: {
            location: '/',
          },
          logs: {
            stdout: 'POST /post\n',
          },
          statusCode: 302,
        },
      },
      {
        // View both posts as the author.
        req: {
          uri: new URL(indexRelUrl(tLater), baseUrl).href,
        },
        res: {
          body: [
            '<!DOCTYPE html>',
            '<html>',
            '<head>',
            '<title>Attack Review Testbed</title>',
            '<script src="/common.js" nonce="xxxx5">',
            '</script>',
            '<link rel="stylesheet" href="/styles.css" nonce="xxxx5">',
            '</head>',
            '<body>',
            '<div class="userfloat">',
            '<span class="user name">Ada<a class="nounder" href="/account">&#9660;</a>',
            '</span>',
            `<form class="lightweight" action="/logout?cont=${ encodeURIComponent(indexRelUrl(tLater)) }"` +
              ' method="POST" name="logout">',
            '<input name="_csrf" type="hidden" value="xxxx"/>',
            '<button class="logoutlink" type="submit">logout</button>',
            '</form>',
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
            // The public post
            '<li>',
            '<span class="author name">Ada</span>',
            '<span class="created">5 minutes ago</span>',
            // Sanitized body content
            '<div class="body">Hello, <b>World</b>! </div>',
            '<div class="images">',
            // Images
            '<a class="usercontent" href="/user-uploads/00000000000000000000000000000000.png">',
            '<img src="/user-uploads/00000000000000000000000000000000.png"/>',
            '</a>',
            '<a class="usercontent" href="/user-uploads/00000000000000000000000000000001.png">',
            '<img src="/user-uploads/00000000000000000000000000000001.png"/>',
            '</a>',
            '</div>',
            '</li>',
            // The private post
            '<li>',
            '<span class="author name">Ada</span>',
            '<span class="created">just now</span>',
            // Sanitized body content
            '<div class="body">This message will self-destruct in 10 seconds.</div>',
            '</li>',
            '</ol>',
            '<div>',
            '<a href="/post">',
            '<button type="button">+ New Post</button>',
            '</a>',
            '</div>',
            '</body>',
            '</html>',
          ],
          logs: {
            stdout: `GET ${ indexRelUrl(tLater) }\n`,
          },
        },
        after(response, body, { uploads }) {
          expect(Array.from(uploads.entries())).to.deep.equal(filenameMapFromUploadPost);
        },
      },
      {
        // logout so we can login as a different user
        req: {
          uri: `${ baseUrl.origin }/logout`,
        },
        res: {
          body: 'IGNORE',
          logs: {
            stdout: 'GET /logout\n',
          },
          statusCode: 200,
        },
      },
      {
        req: (lastResponse, { csrf }) => ({
          uri: `${ baseUrl.origin }/logout`,
          method: 'POST',
          form: {
            cont: '/',
            _csrf: csrf,
          },
        }),
        res: {
          body: [ '' ],
          logs: {
            stdout: 'POST /logout\n',
          },
          headers: {
            location: `${ baseUrl.origin }/`,
          },
          statusCode: 302,
        },
      },
      {
        // View both posts as anonymous.
        req: {
          uri: new URL(indexRelUrl(tLater), baseUrl).href,
        },
        res: {
          body: [
            '<!DOCTYPE html>',
            '<html>',
            '<head>',
            '<title>Attack Review Testbed</title>',
            '<script src="/common.js" nonce="xxxx7">',
            '</script>',
            '<link rel="stylesheet" href="/styles.css" nonce="xxxx7">',
            '</head>',
            '<body>',
            '<div class="userfloat">',
            '<a class="loginlink" href="/login">login</a>',
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
            // The public post
            '<li>',
            '<span class="author name">Ada</span>',
            '<span class="created">5 minutes ago</span>',
            '<div class="body">Hello, <b>World</b>! </div>',
            '<div class="images">',
            '<a class="usercontent" href="/user-uploads/00000000000000000000000000000000.png">',
            '<img src="/user-uploads/00000000000000000000000000000000.png"/>',
            '</a>',
            '<a class="usercontent" href="/user-uploads/00000000000000000000000000000001.png">',
            '<img src="/user-uploads/00000000000000000000000000000001.png"/>',
            '</a>',
            '</div>',
            '</li>',
            // No private post
            '</ol>',
            '<div>',
            '<a href="/post">',
            '<button type="button">+ New Post</button>',
            '</a>',
            '</div>',
            '</body>',
            '</html>',
          ],
          logs: {
            stdout: `GET ${ indexRelUrl(tLater) }\n`,
          },
        },
        after(response, body, { uploads }) {
          expect(Array.from(uploads.entries())).to.deep.equal(filenameMapFromUploadPost);
        },
      },
      {
        // Login as one of Ada's friends
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
            cont: '/post',
            email: 'fae@example.com.',
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
            location: new URL('/post', baseUrl).href,
          },
          statusCode: 302,
        },
      },
      {
        // View both posts as Fae.
        req: {
          uri: new URL(indexRelUrl(tLater), baseUrl).href,
        },
        res: {
          body: [
            '<!DOCTYPE html>',
            '<html>',
            '<head>',
            '<title>Attack Review Testbed</title>',
            '<script src="/common.js" nonce="xxxx9">',
            '</script>',
            '<link rel="stylesheet" href="/styles.css" nonce="xxxx9">',
            '</head>',
            '<body>',
            '<div class="userfloat">',
            '<span class="user name">',
            '<font color="green">Fae</font>',
            '<a class="nounder" href="/account">&#9660;</a>',
            '</span>',
            '<form class="lightweight"' +
              ' action="/logout?cont=%2F%3Fnow%3D1540209900000%26offset%3D4" method="POST" name="logout">',
            '<input name="_csrf" type="hidden" value="xxxx"/>',
            '<button class="logoutlink" type="submit">logout</button>',
            '</form>',
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
            // The public post
            '<li>',
            '<span class="author name">Ada</span>',
            '<span class="created">5 minutes ago</span>',
            '<div class="body">Hello, <b>World</b>! </div>',
            '<div class="images">',
            '<a class="usercontent" href="/user-uploads/00000000000000000000000000000000.png">',
            '<img src="/user-uploads/00000000000000000000000000000000.png"/>',
            '</a>',
            '<a class="usercontent" href="/user-uploads/00000000000000000000000000000001.png">',
            '<img src="/user-uploads/00000000000000000000000000000001.png"/>',
            '</a>',
            '</div>',
            '</li>',
            // The private post
            '<li>',
            '<span class="author name">Ada</span>',
            '<span class="created">just now</span>',
            // Sanitized body content
            '<div class="body">This message will self-destruct in 10 seconds.</div>',
            '</li>',
            '</ol>',
            '<div>',
            '<a href="/post">',
            '<button type="button">+ New Post</button>',
            '</a>',
            '</div>',
            '</body>',
            '</html>',
          ],
          logs: {
            stdout: `GET ${ indexRelUrl(tLater) }\n`,
          },
        },
        after(response, body, { uploads }) {
          expect(Array.from(uploads.entries())).to.deep.equal(filenameMapFromUploadPost);
        },
      },
      {
        // View logged in as Fae, but with viewAsPublic=true
        req: {
          uri: new URL(`${ indexRelUrl(tLater) }&viewAsPublic=true`, baseUrl).href,
        },
        res: {
          body: [
            '<!DOCTYPE html>',
            '<html>',
            '<head>',
            '<title>Attack Review Testbed</title>',
            '<script src="/common.js" nonce="xxxx10">',
            '</script>',
            '<link rel="stylesheet" href="/styles.css" nonce="xxxx10">',
            '</head>',
            '<body>',
            '<div class="userfloat">',
            '<span class="user name">',
            '<font color="green">Fae</font>',
            '<a class="nounder" href="/account">&#9660;</a>',
            '</span>',
            '<form class="lightweight"' +
              ' action="/logout?cont=%2F%3Fnow%3D1540209900000%26offset%3D4%26viewAsPublic%3Dtrue"' +
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
            // The public post
            '<li>',
            '<span class="author name">Ada</span>',
            '<span class="created">5 minutes ago</span>',
            '<div class="body">Hello, <b>World</b>! </div>',
            '<div class="images">',
            '<a class="usercontent" href="/user-uploads/00000000000000000000000000000000.png">',
            '<img src="/user-uploads/00000000000000000000000000000000.png"/>',
            '</a>',
            '<a class="usercontent" href="/user-uploads/00000000000000000000000000000001.png">',
            '<img src="/user-uploads/00000000000000000000000000000001.png"/>',
            '</a>',
            '</div>',
            '</li>',
            // No private post
            '</ol>',
            '<div>',
            '<a href="/post">',
            '<button type="button">+ New Post</button>',
            '</a>',
            '</div>',
            '</body>',
            '</html>',
          ],
          logs: {
            stdout: `GET ${ indexRelUrl(tLater) }&viewAsPublic=true\n`,
          },
        },
        after(response, body, { uploads }) {
          expect(Array.from(uploads.entries())).to.deep.equal(filenameMapFromUploadPost);
        },
      },
    ];
  },
};
