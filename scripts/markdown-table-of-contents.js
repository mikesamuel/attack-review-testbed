#!/usr/bin/env node

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
 * Do just enough Markdown parsing to assemble a table of contents
 * and make sure there are link targets in both the Github hosted
 * version and that hosted at npmjs.com/package/....
 */

'use strict';

// eslint-disable-next-line id-length
const fs = require('fs');
const process = require('process');

const { create } = Object;

function tableOfContentsFor(filename, markdown) {
  const toc = [];
  let lastDepth = 0;
  const ids = create(null);

  const lines = markdown.split(/\n/g);
  for (let i = 0, nLines = lines.length; i < nLines; ++i) {
    let line = lines[i];
    {
      const match = line.match(/^(#{2,})/);
      if (match) {
        // Maybe autogenerate id
        const headerText = line.substring(match[0].length);
        if (!/<a name/.test(headerText)) {
          let id = `hdr-${ headerText.toLowerCase() }`;
          id = id.replace(/^\s+|\s+$/g, '');
          id = id.replace(/\W+/g, '-');
          // Try to align name markers at column 40 but always offset by at least 3 spaces
          // eslint-disable-next-line no-magic-numbers
          const nSpaces = Math.max(3, 40 - line.length);
          const spaces = ' '.repeat(nSpaces);
          line += `${ spaces }<a name="${ id }"></a>`;
        }
      }
    }
    {
      const match = /^(#{2,})(.*?)<a name="([\w-.]+)"><\/a>\s*$/.exec(line);
      if (match) {
        const depth = match[1].length - 1;
        const [ , , text, id ] = match;
        if (id in ids) {
          throw new Error(`${ filename }:${ i }: Heading id ${ id } previously seen at line ${ ids[id] }`);
        }
        ids[id] = i;
        if (depth > lastDepth + 1) {
          throw new Error(
            `${ filename }:${ i }: Heading id ${ id } has depth ${ depth } which skips levels from ${ lastDepth }`);
        }
        const newText = text.replace(/^\s*|\s*$/g, '');
        toc.push(`${ '   '.repeat(depth - 1) }*  [${ newText }](#${ id })\n`);
        lastDepth = depth;
      } else if (/^##/.test(line)) {
        throw new Error(`${ filename }:${ i }: Heading lacks identifier`);
      }
    }
    lines[i] = line;
  }
  return {
    markdown: lines.join('\n'),
    toc: toc.join(''),
  };
}

function replaceTableOfContentsIn(filename, markdown, toc) {
  const match = /(\n<!-- TOC -->\n)(?:[^\n]|\n(?!<!--))*(\n<!-- \/TOC -->\n)/.exec(markdown);
  if (match) {
    return `${ markdown.substring(0, match.index) }${ match[1] }${ toc }${ match[2] }${
      markdown.substring(match.index + match[0].length) }`;
  }
  if (toc) {
    throw new Error(`${ filename }: Cannot find <!-- TOC --> delimited space for the table of contents`);
  }
  return markdown;
}

if (require.main === module) {
  const [ , , ...filenames ] = process.argv;
  for (const filename of filenames) {
    // eslint-disable-next-line no-sync
    const originalContent = fs.readFileSync(filename, { encoding: 'utf8' });
    // eslint-disable-next-line prefer-const
    let { markdown, toc } = tableOfContentsFor(filename, originalContent);

    markdown = replaceTableOfContentsIn(filename, markdown, toc);

    if (originalContent !== markdown) {
      // eslint-disable-next-line no-sync
      fs.writeFileSync(filename, markdown, { encoding: 'utf8' });
    }
  }
}

module.exports = {
  tableOfContentsFor,
  replaceTableOfContentsIn,
};
