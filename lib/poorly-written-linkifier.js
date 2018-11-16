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

const PROTOCOL_REGEX = String.raw`\b([a-z][a-z0-9+\-.]*):`;

const PROTOCOL_PATTERN = new RegExp(`^${ PROTOCOL_REGEX }`, 'i');

const AUTHORITY_REGEX = String.raw`[^/:?#\s<>!,;]*`;
const AUTHORITY_PATTERN = new RegExp(`^(?:[^:/#?]*:)?//(${ AUTHORITY_REGEX })`);

/** If there's no scheme and the URL is not protocol relative, make it complete. */
function coerceToUrl(url) {
  const pmatch = PROTOCOL_PATTERN.exec(url);
  let scheme = null;
  if (pmatch) {
    scheme = pmatch[1].toLowerCase();
  } else {
    scheme = 'http';
    url = `//${ url }`;
  }
  const amatch = AUTHORITY_PATTERN.exec(url);
  const authority = amatch && amatch[1];
  const schemeSpecificPart = amatch ? url.substring(amatch[0].length) : null;
  return { url, scheme, authority, schemeSpecificPart };
}

const LINK_PATTERN = new RegExp(
  // We either need a scheme or something that is obviously an origin.
  String.raw`(?:` +
  // An optional protocol
  String.raw`(?:(?:${ PROTOCOL_REGEX })?\/\/)` + AUTHORITY_REGEX +
  // Host may be numeric, IPv6, or a registry name.
  String.raw`|` +
  String.raw`(?:${ REG_NAME }|${ IPV4 }|${ IPV6 })` +
  // There might be a port.
  String.raw`(?:[:]\d+)?` +
  String.raw`)` +
  // Match path, query and fragment parts until a space or a punctuation
  // character that is followed by a space.
  String.raw`(?:[^\s.!?,;<>]|[.!?,;](?![\s]|$))*`,
  'ig');

const SCHEME_DATA = {
  // Show an email icon to the right.
  mailto: { attrs: ' class="ext-link email"' },
  // Show a download icon to the right.
  ftp: { attrs: ' class="ext-link download"' },
  http: {
    // An internal link.  Do nothing.
    'example.com'() {
      return { attrs: '' };
    },
    '*'(scheme, authority) {
      // Tell users which site they're going to.
      return {
        attrs: ' class="ext-link"',
        // Make origin apparent to users.
        text: ` (${ normhtml(authority) })`,
      };
    },
  },
  https(url) {
    return SCHEME_DATA.http(url);
  },
  easteregg: { attrs: ' title="&#x1f95a;"' },
};

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

  function rewriteLink(href) {
    const { url, scheme, authority, schemeSpecificPart } = coerceToUrl(href);

    // Extract extra info from the URL.
    let extras = SCHEME_DATA[scheme];
    if (extras && authority) {
      if (extras[authority]) {
        extras = extras[authority];
      } else if (extras['*']) {
        extras = extras['*'];
      }
    }
    while (typeof extras === 'function') {
      extras = extras(scheme, authority, schemeSpecificPart);
    }
    const { attrs = '' } = extras || {};

    return `<a href="${ normhtml(url) }"${ attrs }>${ href }</a>`;
  }

  // Rewrite links
  html = html.replace(LINK_PATTERN, rewriteLink);

  // Reconsistute tags.
  html = html.replace(
    /<tag #(\d+)>/g,
    (whole, index) => sideTable[index]);

  return html;
}

module.exports = linkify;
