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

/* eslint no-magic-numbers: 0 */

'use strict';

const { expect } = require('chai');
const { describe, it } = require('mocha');
const linkify = require('../lib/poorly-written-linkifier.js');

describe('poorly-written-linkifier', () => {
  it('empty', () => {
    expect(linkify('')).to.equal('');
  });
  it('no links', () => {
    expect(linkify('Hello, World!')).to.equal('Hello, World!');
  });
  it('internal url in tag', () => {
    expect(linkify('Hello, <a href="http://example.com/world">World</a>!'))
      .to.equal('Hello, <a href="http://example.com/world">World</a>!');
  });
  it('external url in tag', () => {
    expect(linkify('Hello, <a href="http://other.com/world">World</a>!'))
      .to.equal('Hello, <a href="http://other.com/world">World</a>!');
  });
  it('internal url outside tag', () => {
    expect(linkify('Hello, http://example.com/world!'))
      .to.equal('Hello, <a href="http://example.com/world">http://example.com/world</a>!');
  });
  it('external url outside tag', () => {
    expect(linkify('Hello, http://other.com/world!'))
      .to.equal('Hello, <a href="http://other.com/world" class="ext-link">http://other.com/world</a>!');
  });
  it('internal url missing scheme', () => {
    expect(linkify('Hello, example.com/world!'))
      .to.equal('Hello, <a href="//example.com/world">example.com/world</a>!');
  });
  it('external url missing scheme', () => {
    expect(linkify('Hello, other.org/world!'))
      .to.equal('Hello, <a href="//other.org/world" class="ext-link">other.org/world</a>!');
  });
  it('multiple', () => {
    expect(linkify('Go to <ul><li>foo.com or<li>bar.com</ul>'))
      .to.equal(
        'Go to <ul><li><a href="//foo.com" class="ext-link">foo.com</a> or' +
        '<li><a href="//bar.com" class="ext-link">bar.com</a></ul>');
  });
  it('unfortunate', () => {
    // We want it to have a large attack surface.
    // eslint-disable-next-line no-script-url
    expect(linkify('4 lulz: javascript://example.com%0aalert(document.domain)'))
    // eslint-disable-next-line no-script-url
      .to.equal('4 lulz: <a href="javascript://example.com%0aalert(document.domain)">' +
                // eslint-disable-next-line no-script-url
                'javascript://example.com%0aalert(document.domain)</a>');
  });
});
