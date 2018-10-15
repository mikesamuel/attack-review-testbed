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
 * A linkifier that adds link tags to link-like substrings in HTML
 * text nodes.
 */

const tlds = require('tlds');

function descLength(stra, strb) {
  return strb.length - stra.length;
}

const replacements = {
  '<': '&lt;',
  '>': '&gt;',
  '"': '&#34;',
};

function normhtml(str) {
  // Like escapehtml but doesn't escape & since we don't want to have
  // to decode and then reencode.
  return str.replace(/[<>"]/g, (chr) => replacements[chr]);
}

// A registry name should end in a TLD.  We sort TLDs so that the RegExp greedily matches
// the longest TLD: e.g. .community should come before .com.
const REG_NAME = String.raw`(?:[a-z0-9\-_~!$&'()*+,;=%]+[.])+(?:${ tlds.sort(descLength).join('|') })[.]?`;

// TODO: range restrict
// eslint-disable-next-line id-match
const IPV4 = String.raw`\d+(?:\.\d+){3}(?=[/?#]|:\d)`;

// TODO: count hex digits properly.
// eslint-disable-next-line id-match
const IPV6 = String.raw`\[(?!\])(?:[0-9a-f]+(?:[:][0-9a-f]+)*)?(?:[:][:](?:[0-9a-f]+(?:[:][0-9a-f]+)*))?\]`;

const PROTOCOL_PATTERN = new RegExp(String.raw`(\b[a-z][a-z0-9+\-.]*):`, 'i');

/** If there's no scheme and the URL is not protocol relative, make it complete. */
function schemify(url) {
  const match = PROTOCOL_PATTERN.exec(url);
  if (match && match.index === 0) {
    return url;
  }
  return `//${ url }`;
}

const LINK_PATTERN = new RegExp(
  // An optional protocol
  String.raw`(?:(?:${ PROTOCOL_PATTERN.source })?\/\/)?` +
  // Host may be numeric, IPv6, or a registry name.
  String.raw`(?:${ REG_NAME }|${ IPV4 }|${ IPV6 })` +
  // There might be a port.
  String.raw`(?:[:]\d+)?` +
  // Match path, query and fragment parts until a space or a punctuation
  // character that is followed by a space.
  String.raw`(?:[^\s.!?,;<>]|[.!?,;](?![\s]|$))*`,
  'ig');

function linkify(html) {
  html = `${ html }`;

  // Pull tags out into a side-table.
  const sideTable = [];
  html = html.replace(
    /<\/?[A-Za-z](?:[^>"']|"[^"]*"|'[^']*')*>/g,
    (tag) => {
      const index = sideTable.length;
      sideTable.push(tag);
      return `<tag #${ index }>`;
    });

  // Rewrite links
  html = html.replace(
    LINK_PATTERN,
    (href) => `<a href="${ schemify(normhtml(href)) }">${ href }</a>`);

  // Reconsistute tags.
  html = html.replace(
    /<tag #(\d+)>/g,
    (whole, index) => sideTable[index]);

  return html;
}

module.exports = linkify;
