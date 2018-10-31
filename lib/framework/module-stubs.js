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

const { min, max } = Math;
const { create } = Object;
const { apply: rapply, get: rget } = Reflect;

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

  // eslint-disable-next-line global-require
  const Promise = require('promise/lib/node-extensions.js');

  /*

  // with arity 3

  const f = function (a0,a1,a2) {
    var self = this;
    return new Promise(function (rs, rj) {
      var res = fn.call(self,a0,a1,a2,function (err, res) {
        if (err) {
          rj(err);
        } else {
          rs(res);
        }
      });
      if (res && (typeof res === "object" || typeof res === "function") &&
          typeof res.then === "function") {
        rs(res);
      }
    });
  };

  // with fn of length 3

  function (a0,a1,a2) {
    var self = this;
    var args;
    var argLength = arguments.length;
    if (arguments.length > 3) {
      args = new Array(arguments.length + 1);
      for (var i = 0;
           i < arguments.length;
           i++) {
        args[i] = arguments[i];
      }
    }
    return new Promise(function (rs, rj) {
      var cb = function (err, res) {
        if (err) {
          rj(err);
        } else {
          rs(res);
        }
      }
      ;
      var res;
      switch (argLength) {
      case 0:res = fn.call(self,cb);
        break;
      case 1:res = fn.call(self,a0,cb);
        break;
      case 2:res = fn.call(self,a0,a1,cb);
        break;
      case 3:res = fn.call(self,a0,a1,a2,cb);
        break;
      default:args[argLength] = cb;
        res = fn.apply(self, args);
      }
      if (res && (typeof res === "object" || typeof res === "function") &&
          typeof res.then === "function") {
        rs(res);
      }
    });
  }
  */

  const handlerForArgumentCount = create(null);

  // This does what the original denodeify does but without invoking
  // `new Function(...)`.
  // It's unnecessary since delicate-globals-rewrite now allows it
  // to do just that, but it seems to work, and might be worth
  // upstreaming as versions of Node without Proxy reach end of support.
  function denodeify(fun, argumentCount) {
    if (typeof fun !== 'function') {
      throw new TypeError(typeof fun);
    }
    let minArity = 0;
    // eslint-disable-next-line no-bitwise
    let maxArity = (fun.length >>> 0);
    // eslint-disable-next-line no-bitwise
    if (argumentCount === (argumentCount >>> 0)) {
      minArity = argumentCount;
      maxArity = argumentCount;
    }

    const key = `${ minArity }/${ maxArity }`;

    if (!handlerForArgumentCount[key]) {
      handlerForArgumentCount[key] = {
        get(target, prop, receiver) {
          if (prop === 'length') {
            return maxArity;
          }
          return rget(target, prop, receiver);
        },
        apply(target, thisArgument, argumentsList) {
          return new Promise((resolve, reject) => {
            const { length } = argumentsList;
            const arity = min(maxArity, max(minArity, length));

            let args = null;
            if (arity === length) {
              args = argumentsList;
            } else {
              args = [];
              for (let i = 0; i < arity; ++i) {
                args[i] = argumentsList[i];
              }
            }
            args[arity] = (exc, res) => {
              if (exc) {
                reject(exc);
              } else {
                resolve(res);
              }
            };
            const res = rapply(target, thisArgument, args);
            if (res && (typeof res === 'object' || typeof res === 'function') &&
                typeof res.then === 'function') {
              resolve(res);
            }
          });
        },
      };
    }
    return new Proxy(fun, handlerForArgumentCount[key]);
  }
  Promise.denodeify = denodeify;
};
