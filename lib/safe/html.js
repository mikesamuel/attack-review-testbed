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

/**
 * @fileoverview
 * HTML utilities.
 */

'use strict';

require('module-keys/cjs').polyfill(module, require);

const { TrustedHTML } = require('web-contract-types');
const { Mintable } = require('node-sec-patterns');
const createDOMPurify = require('dompurify');
const { JSDOM } = require('jsdom');

const mintTrustedHTML = require.keys.unbox(
  Mintable.minterFor(TrustedHTML), () => true, (x) => x);
const { window } = (new JSDOM(''));
const DOMPurify = createDOMPurify(window);
const sanitize = DOMPurify.sanitize.bind(DOMPurify);

/**
 * Sanitizes an arbitrary untrusted input to TrustedHTML by stripping
 * unsafe tags, attributes, and other constructs and normalizing the
 * output to avoid parser corner cases.
 *
 * @param {*} html Passes TrustedHTML through unchange.
 *    Otherwises coerces to string and sanitizes.
 * @return {TrustedHTML}
 */
module.exports.sanitize = (html) => {
  if (TrustedHTML.is(html)) {
    return html;
  }
  return mintTrustedHTML(sanitize(`${ html }`));
};
