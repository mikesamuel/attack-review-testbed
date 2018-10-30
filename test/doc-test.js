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
 * Some sanity checks for README.md files.
 *
 * - Checks example code in README.md files for well-formedness
 * - Runs example code that has a comment like //! expected output
 * - Looks for undefined link targets like [foo][never defines].
 * - Checks that tables of contents are up-to-date with the pages header structure.
 */

/* eslint no-sync: 0 */

const { expect } = require('chai');
const { describe, it } = require('mocha');

// eslint-disable-next-line id-length
const fs = require('fs');
// eslint-disable-next-line id-length
const vm = require('vm');

const {
  tableOfContentsFor,
  replaceTableOfContentsIn,
} = require('../scripts/markdown-table-of-contents.js');

const markdownPaths = {
  'README.md': require.resolve('../README.md'),
};

function lookForUndefinedLinks(markdownPath) {
  let markdown = fs.readFileSync(markdownPath, { encoding: 'utf8' });

  // Strip out code blocks.
  markdown = markdown.replace(
    /^(\s*`{3,})\w*\n(?:[^`]|`(?!``))*\n\1\n/mg, '$1CODE\n');
  markdown = markdown.replace(
    /`[^`\r\n]+`/g, ' CODE ');

  // Extract link names.
  const namedLinks = new Set();
  for (;;) {
    const original = markdown;
    markdown = markdown.replace(/^\[(.*?)\]:[ \t]*\S.*/m, (all, name) => {
      namedLinks.add(name);
      return `<!-- ${ all } -->`;
    });
    if (original === markdown) {
      break;
    }
  }

  let undefinedLinks = new Set();
  function extractLink(whole, text, target) {
    target = target || text;
    if (!namedLinks.has(target)) {
      undefinedLinks.add(target);
    }
    return ' LINK ';
  }
  // Look at links.
  for (;;) {
    const original = markdown;
    markdown = markdown.replace(
      /(?:^|[^\]\\])\[((?:[^\\\]]|\\.)+)\]\[(.*?)\]/,
      extractLink);
    if (original === markdown) {
      break;
    }
  }

  undefinedLinks = Array.from(undefinedLinks);
  expect(undefinedLinks).to.deep.equals([]);
}


function hackyUpdoc(markdownPath) {
  const markdown = fs.readFileSync(markdownPath, { encoding: 'utf8' });

  // Strip out code blocks.
  const fencedJsBlockPattern = /^(\s*)```js(\n(?:[^`]|`(?!``))*)\n\1```\n/mg;
  for (let match; (match = fencedJsBlockPattern.exec(markdown));) {
    const [ , , code ] = match;
    const lineOffset = markdown.substring(0, match.index).split(/\n/g).length;

    it(`Line ${ lineOffset }`, () => {
      let tweakedCode = code.replace(
        /^console[.]log\((.*)\);\n\/\/! ?(.*)/mg,
        (whole, expr, want) => `expect(String(${ expr })).to.equal(${ JSON.stringify(want) });\n`);

      if (tweakedCode === code) {
        // Not a test.  Just check well-formedness
        tweakedCode = `(function () {\n${ tweakedCode }\n})`;
      }

      const script = new vm.Script(tweakedCode, { filename: markdownPath, lineOffset });

      script.runInNewContext({ require, expect });
    });
  }
}


describe('doc', () => {
  describe('links', () => {
    for (const [ name, mdPath ] of Object.entries(markdownPaths)) {
      it(name, () => {
        lookForUndefinedLinks(mdPath);
      });
    }
  });
  describe('code examples', () => {
    for (const [ name, mdPath ] of Object.entries(markdownPaths)) {
      describe(name, () => {
        hackyUpdoc(mdPath);
      });
    }
  });
  describe('tocs', () => {
    for (const [ name, mdPath ] of Object.entries(markdownPaths)) {
      it(name, () => {
        const originalMarkdown = fs.readFileSync(mdPath, { encoding: 'utf8' });
        const { markdown, toc } = tableOfContentsFor(mdPath, originalMarkdown);
        const markdownProcessed = replaceTableOfContentsIn(mdPath, markdown, toc);
        expect(originalMarkdown).to.equal(markdownProcessed, mdPath);
      });
    }
  });
});
