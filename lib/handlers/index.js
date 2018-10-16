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
 * Displays recent posts visible to the current user.
 */

const relativeDate = require('tiny-relative-date');
const template = require('./index.pug');
const { getPosts } = require('../dbi.js');


exports.handle = (bundle) => {
  const { res, reqUrl, database, handleError, currentAccount } = bundle;

  const aid = currentAccount ? currentAccount.aid : null;
  const viewAsPublic = !aid || reqUrl.searchParams.get('viewAsPublic') !== 'false';
  // Allow tests to specify "now" so that we can get repeatable test behavior.
  const now = new Date(Number(reqUrl.searchParams.get('now') || Date.now()));
  const limit = Number(reqUrl.searchParams.get('count') || 0);
  const offset = Number(reqUrl.searchParams.get('offset') || 0);
  getPosts(database, viewAsPublic ? null : aid, { limit, offset }).then(
    (posts) => {
      res.statusCode = 200;
      res.end(template(Object.assign(
        {},
        bundle,
        {
          viewAsPublic,
          posts,
          fmtDate(date) {
            return relativeDate(date, now);
          },
        })));
    },
    handleError);
};
