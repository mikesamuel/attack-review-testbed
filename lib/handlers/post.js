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

/**
 * @fileoverview
 * Allows posting text and images.
 */

const path = require('path');

const template = require('./post.pug');
const childProcess = require('../safe/child_process.js');
const { sanitize } = require('../safe/html.js');

const relativeDate = require('tiny-relative-date');
const multiparty = require('multiparty');
const mime = require('mime-types');
const safesql = require('safesql');
const { sh } = require('sh-template-tag');

exports.handle = (bundle, handleError) => {
  const {
    req, res, reqUrl, database, currentAccount,
    server: { staticFileRootDir, urlForFile },
  } = bundle;

  // Allow tests to specify "now" so that we can get repeatable test behavior.
  const now = new Date(Number(reqUrl.searchParams.get('now') || Date.now()));

  const userUploadsDir = path.resolve(path.join(staticFileRootDir, 'user-uploads'));

  // First we process any image uploads.
  // Then we build a preview object.
  // Then we figure out whether to add to the database or render the preview form.

  // We don't delete images on error.  Instead we could deal with images uploaded
  // but never attached to a form via a cron job that deletes images that neither
  // appear in the PostResource table, nor have a recent mtime.

  let uploadPromise = null;
  const isPost = req.method === 'POST';
  if (isPost) {
    uploadPromise = new Promise((resolve, reject) => {
      new multiparty.Form().parse(req, (exc, fields, files) => {
        if (exc) {
          handleError(exc);
          return;
        }

        if (files) {
          const { upload } = files;
          if (upload) {
            const uploadedImagePaths = [];
            const userErrors = [];
            let cmd = null;
            for (const { originalFilename, path: tempPath, size } of upload) {
              if (size === 0) {
                continue;
              }
              const basename = path.basename(tempPath);
              const mimeType = mime.lookup(basename);
              if (typeof mimeType === 'string' && /^image\//.test(mimeType)) {
                const imagePath = path.join(userUploadsDir, basename);
                const mvCommand = sh`mv -n -- ${ tempPath } ${ imagePath }`;
                cmd = cmd ? sh`${ cmd } && ${ mvCommand }` : mvCommand;
                uploadedImagePaths.push(imagePath);
              } else {
                userErrors.push(
                  `Upload ${ originalFilename } does not appear to be an image: ${ mimeType }`);
              }
            }
            if (cmd) {
              cmd = sh`mkdir -p ${ userUploadsDir } && ${ cmd }`;
              childProcess.exec(
                cmd, {},
                (execErr, stdout, stderr) => {
                  if (execErr) {
                    const { signal, code } = execErr;
                    reject(new Error(
                      `${ execErr.message }
command ${ cmd } failed with status ${ code }, signal ${ signal }
${ stderr }`));
                  } else {
                    resolve({ uploadedImagePaths, userErrors, fields });
                  }
                });
            } else {
              resolve({ uploadedImagePaths: [], userErrors, fields });
            }
          }
        }
      });
    });
  } else {
    const fields = {};
    for (const [ key, values ] of reqUrl.searchParams.entries()) {
      fields[key] = values;
    }
    uploadPromise = Promise.resolve(
      { uploadedImagePaths: [], userErrors: [], fields });
  }

  uploadPromise.then(
    ({ uploadedImagePaths, userErrors, fields }) => {
      // Convert paths to absolute path URIs.
      const imageUrlPaths = uploadedImagePaths.map(urlForFile);
      const images = [ ...(fields.imagepath || []), ...imageUrlPaths ];
      const isPublic = Boolean(fields.public);
      const body = fields.body || '';

      if (isPost && !isPublic && !currentAccount) {
        userErrors.push('Cannot post privately and anonymously');
      }

      const showPreview = !isPost || fields.preview || userErrors.length;
      if (showPreview) {
        // eslint-disable-next-line no-use-before-define
        preview();
      } else {
        // eslint-disable-next-line no-use-before-define
        commit();
      }

      function preview() {
        res.statusCode = 200;
        res.end(template(Object.assign(
          {},
          bundle,
          {
            preview: {
              body: sanitize(body),
              unsanitizedBody: body,
              isPublic,
              images,
              authorName: currentAccount ? currentAccount.displayName : null,
              authorUrl: currentAccount ? currentAccount.publicUrl : null,
              created: now,
            },
            userErrors,
            fmtDate(date) {
              return relativeDate(date, now);
            },
          })));
      }

      function commit() {
        const authorId = currentAccount ? currentAccount.aid : null;

        function insertPostSql() {
          return safesql.pg`
INSERT INTO Posts
  ( author,        public,        bodyhtml  )
VALUES
  ( ${ authorId }, ${ isPublic }, ${ body } )
RETURNING pid`;
        }

        function insertImagesPromise(client, pid) {
          if (!images.length) {
            return Promise.resolve(null);
          }
          const imageTuples = images.map((relurl) => safesql.pg`( ${ pid }, ${ relurl } )`);
          const imageSql = safesql.pg`INSERT INTO PostResources (pid, urlpath) VALUES ${ imageTuples };`;
          return client.query(imageSql);
        }

        database.connect().then(
          (client) => {
            function commitSucceeded() {
              client.release();
              res.statusCode = 302;
              res.setHeader('Location', '/');
              res.end('Posted');
            }

            function commitFailed(exc) {
              client.release();
              handleError(exc);
            }
            client.query(insertPostSql()).then(
              ({ rows: [ { pid } ] }) => {
                insertImagesPromise(client, pid).then(
                  commitSucceeded,
                  commitFailed);
              },
              commitFailed);
          },
          handleError);
      }
    },
    handleError);
};
