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
 * Stub out modules that we don't want to actually load in production.
 */

module.exports = (preventLoad) => {
  function stubFor(id) {
    const filename = require.resolve(id);
    if (preventLoad) {
      const stub = new module.constructor(filename, filename);
      stub.loaded = true;

      Object.defineProperty(
        require.cache,
        filename,
        { value: stub, enumerable: true });
      return stub;
    }

    // eslint-disable-next-line global-require
    require(id);
    return require.cache[filename];
  }

  // stealthy-require fails to clear the module cache which is
  // super obnoxious.  module-keys cause that to fail noisily
  // which is good, but that causes modules that need it to fail.
  // Return a stub that doesn't do the objectionable things that
  // stealthy-require does.  This would cause problems if we
  // actually needed jsdom to load scripts instead of just provide
  // a DOM parser for DOMPurify.
  // eslint-disable-next-line func-name-matching
  stubFor('stealthy-require').exports = function stealthyRequire(
    // eslint-disable-next-line no-unused-vars, id-blacklist
    requireCache, callback, callbackForModulesToKeep, module) {
    return callback();
  };

  // We use jsdom to parse XML.  We don't want it making external
  // HTTP requests.  XMLHttpRequest should be unnecessary but
  // initializing the module fails because we deny access to
  // "http" and "child_process".
  // eslint-disable-next-line func-name-matching
  stubFor('jsdom/lib/jsdom/living/xmlhttprequest.js').exports = function createXMLHttpRequest() {
    return {};
  };

  stubFor('jsdom/lib/jsdom/living/websockets/WebSocket-impl.js').exports = {
    implementation: class WebSocketImpl {
    },
  };

  stubFor('jsdom/lib/jsdom/browser/resources/resource-loader.js').exports = class ResourceLoader {
    // May need to stub this out so that fetch('file:') does something useful.
  };
};
