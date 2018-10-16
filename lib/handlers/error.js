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
 * Dumps an error trace to the output.
 */

const { isProduction } = require('../framework/is-prod.js');
const template = require('./error.pug');

function handleError(bundle, exc) {
  const { res } = bundle;

  // eslint-disable-next-line no-console
  console.error(exc);

  res.statusCode = 500;
  res.write(template(Object.assign({}, bundle, { exc, isProduction })));
  res.end();
}

exports.handle = handleError;
