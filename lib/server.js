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
 * Glue code that spins up an HTTP server, requires output bodies to be
 * Trusted HTML, manages database connections, and dispatches to HTTP
 * request handlers.
 */

// SENSITIVE - Attaches security machinery to requests.

// GUARANTEE - All POST requests must have a valid CSRF token or
// they cause no state changes.

// GUARANTEE - The only responses with a content-type of text/html are ones that
// are a concatenation of the content of properly minted TrustedHTML values, or
// ones that are the content of non-user-uploaded files under ../../static.

// GUARANTEE - An attacker cannot predict the CSP nonce allocated for any
// response that has not yet been delivered.

// GUARANTEE - One user cannot get another user's session nonce.

require('module-keys/cjs').polyfill(module, require);

const crypto = require('crypto');
const http = require('http');
const path = require('path');
const { URL } = require('url');

const pugRequire = require('pug-require');
pugRequire.configurePug({
  filterOptions: {
    trustedTypes: {
      // Add hidden inputs to forms that use csrf-crypto's default key name.
      csrfInputName: '_csrf',
      csrfInputValueExpression: '_csrf',
      // Thread the per-request nonce from bundle through to envelope.pug
      // which loads scripts and styles.
      nonceValueExpression: 'cspNonce',
    },
  },
});

const bodyParser = require('body-parser');
const cookie = require('cookie');
const csrfCrypto = require('csrf-crypto');
const multiparty = require('multiparty');
const serveStatic = require('serve-static');
const { TrustedHTML } = require('web-contract-types');
const { handle: handleError } = require('./handlers/error.js');
const { getCurrentAccount } = require('./dbi.js');

const SESSION_COOKIE_NAME = 'session';

function mintUnguessable(nBytes) {
  // 256 bits of websafe entropy
  // eslint-disable-next-line no-magic-numbers
  return crypto.randomBytes(nBytes || 32).toString('base64');
}

function setHeaders(res) {
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  // Let attackers focus on the target app instead of finding X-XSS-Protection bypasses.
  res.setHeader('X-XSS-Protection', '0');
  res.setHeader(
    'Content-Security-Policy',
    'default-src none; img-src \'self\'; form-action none; report-uri /client-error');
}

const urlDataParser = bodyParser.urlencoded({ extended: false });
const textDataParser = bodyParser.text({
  type() {
    return true;
  },
});

const sessionKeyWhitelist = new Set([
  // eslint-disable-next-line global-require
  require('./handlers/login.js').publicKey, require('./handlers/logout.js').publicKey,
]);
function sessionNonceGuard(key) {
  return require.keys.isPublicKey(key) && key() && sessionKeyWhitelist.has(key);
}

function start(
  { hostName, port, rootDir, database, writeToPlaybackLog },
  onStart, unguessable = mintUnguessable) {
  const staticFileRootDir = path.join(rootDir, 'static');
  const staticHandler = serveStatic(staticFileRootDir, { setHeaders });

  const csrf = csrfCrypto({
    // If sharding, this secret would have to be shared by all instances.
    key: unguessable(),
    // secure:true would go here to restrict to https, but we serve to localhost.
    getUserData(req) {
      return req.cookies[SESSION_COOKIE_NAME];
    },
  });

  const server = http.createServer(
    // eslint-disable-next-line no-use-before-define
    (req, res) => staticHandler(req, res, csrf.bind(null, req, res, handleRequest.bind(null, req, res))));

  server.listen(port, hostName, (exc) => {
    if (exc) {
      onStart(exc, null);
    } else {
      onStart(null, server.address().port);
    }
  });
  function stop() {
    server.close();
  }

  return { stop };

  function unguessableFile() {
    return unguessable().replace(/\//g, '.');
  }

  // A per-session URL-safe secret.
  function sessionNonceFor(req, res) {
    let nonce = req.cookies[SESSION_COOKIE_NAME];
    if (!nonce) {
      nonce = unguessableFile();
      // Backfill cookies.
      req.cookies[SESSION_COOKIE_NAME] = nonce;
    }
    res.cookie(
      SESSION_COOKIE_NAME, nonce,
      {
        sameSite: true,
        httpOnly: true,
        // seconds
        // eslint-disable-next-line no-magic-numbers
        maxAge: 7 * 24 * 60 * 60,
      });
    return nonce;
  }

  function requireTrustedHTML(...chunks) {
    const html = TrustedHTML.concat(...(chunks.map(TrustedHTML.escape)));
    return TrustedHTML.is(html) ? html.content : ' ';
  }

  function monkeypatch(req, res) {
    const cookies = [];

    // This does some express-esque things that make it easier to use
    // libraries like csrf-crypto.
    res.req = req;
    req.res = res;
    req.cookies = req.cookies || cookie.parse(req.headers.cookie || '');
    res.cookie = (...args) => {
      cookies.push(cookie.serialize(...args));
      res.setHeader('Set-Cookie', cookies);
    };

    // Ensure that the response body is trusted HTML chunks.
    const end = res.end.bind(res);
    const write = res.write.bind(res);
    res.end =
      (html, ...rest) =>
        (html || rest.length ? end(requireTrustedHTML(html), ...rest) : end());
    res.write = (html, ...rest) => write(requireTrustedHTML(html), ...rest);
  }

  // Handles and end()s HTTP requests.
  function handleRequest(req, res) {
    monkeypatch(req, res);

    // Derive some useful info from the request.
    const actualPort = server.address().port;
    const reqUrl = new URL(req.url, `http://${ hostName }:${ actualPort }/`);
    reqUrl.hostName = hostName;
    reqUrl.port = actualPort;
    const pathname = decodeURIComponent(reqUrl.pathname);
    // eslint-disable-next-line no-console
    console.log(`${ req.method } ${ req.url }`);

    // Generate secrets for various scopes.
    // Scoped to response
    const cspNonce = unguessable();
    // Scoped to session.
    const sessionNonce = sessionNonceFor(req, res);

    // Write some common headers early.
    setHeaders(res);
    res.setHeader(
      // Overrides any from setHeaders
      'Content-Security-Policy',
      // eslint-disable-next-line max-len
      `default-src 'nonce-${ cspNonce }'; img-src 'self'; form-action 'self'; connect-src 'self'; report-uri /client-error`);
    res.setHeader('Content-type', 'text/html; charset=UTF-8');

    // Create a data bundle so we can delegate to path-specific handlers.
    const bundle = {
      reqUrl,
      req,
      res,
      server: {
        hostName,
        port,
        rootDir,
        staticFileRootDir,
        stop,
        /** Maps a file path to a URL that will fetch that file via the static server. */
        urlForFile(file) {
          return `/${ path.relative(staticFileRootDir, file).split(path.sep).map(encodeURIComponent).join('/') }`;
        },
      },
      database,
      cspNonce,
      sessionNonce: require.keys.box(sessionNonce, sessionNonceGuard),
      /* eslint-disable no-underscore-dangle */
      get _csrf() {
        // Thread through from crypto-csrf above to Pug automagic.
        delete this._csrf;
        this._csrf = res.getFormToken();
        return this._csrf;
      },
      /* eslint-enable no-underscore-dangle */
    };

    // Until a handler decides otherwise.
    res.statusCode = 500;

    const errorHandler = handleError.bind(null, bundle);

    const accountPromise = getCurrentAccount(database, sessionNonce);
    const bodyPromise = new Promise((resolve, reject) => {
      req.body = {};
      req.files = {};

      if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
        resolve(false);
      } else {
        // Neither CSP report-uri POSTs nor static/common.js POSTs
        // send CSRF headers and that's OK since POSTs to /client-error
        // are just dead drops.
        const needsCsrfCheck = pathname !== '/client-error';

        const contentType = req.headers['content-type'];
        if (/^application\/x-www-form-urlencoded(?:;|$)/i.test(contentType)) {
          // TODO: box PII fields here to prevent leaks via logs.
          urlDataParser(req, res, (bodyFailure) => {
            if (bodyFailure) {
              reject(bodyFailure);
            } else {
              resolve(needsCsrfCheck);
            }
          });
        } else if (/^multipart\//i.test(contentType)) {
          try {
            new multiparty.Form().parse(req, (exc, fields, files) => {
              if (exc) {
                reject(exc);
                return;
              }
              const body = Object.create(null);
              for (const [ key, [ value ] ] of Object.entries(fields)) {
                body[key] = value;
              }

              req.body = body;
              req.fields = fields;
              req.files = files;
              resolve(needsCsrfCheck);
            });
          } catch (bodyParseFailure) {
            reject(bodyParseFailure);
          }
        } else if (/^(?:application\/(?:json|csp-report)|text\/plain)(?:;|$)/i.test(contentType)) {
          textDataParser(req, res, (bodyFailure) => {
            if (bodyFailure) {
              reject(bodyFailure);
            } else {
              resolve(needsCsrfCheck);
            }
          });
        } else {
          resolve(needsCsrfCheck);
        }
      }
    });

    /**
     * Log a request so we can replay attacks.
     * This appends to a log file that hopefully will allow us to playback successful and
     * unsuccessful attacks against variant servers.
     */
    function logStructured(extras) {
      if (typeof writeToPlaybackLog === 'function') {
        writeToPlaybackLog(Object.assign(
          {
            req: {
              url: reqUrl.href,
              method: req.method,
              headers: req.headers,
              cookies: req.cookies,
              body: req.body,
              fields: req.fields,
              csrf: req.body && req.body._csrf, // eslint-disable-line no-underscore-dangle
              files: req.files,
            },
            nonces: {
              sessionNonce,
              cspNonce,
            },
          },
          extras));
      }
    }

    Promise.all([ accountPromise, bodyPromise ]).then(
      ([ currentAccount, needsCsrfCheck ]) => {
        logStructured({ currentAccount });

        if (needsCsrfCheck) {
          let failure = null;
          try {
            // eslint-disable-next-line no-underscore-dangle
            if (!req.verifyToken(req.body._csrf)) {
              failure = new Error('CSRF Token Not Found');
            }
          } catch (verifyError) {
            failure = verifyError || new Error('CSRF Check Failed');
          }
          if (failure) {
            errorHandler(failure);
            return;
          }
        }

        bundle.currentAccount = currentAccount;

        // Intentionally large attack surface.
        // Yes, this may be the worst (PHP) way to do request dispatch.
        // If we can harden this, then express's more limited auto-require based on
        // file extension should pose no problems.
        let handlerPath = pathname.replace(/^\//, '') || 'index';
        try {
          handlerPath = require.resolve(`./handlers/${ handlerPath }`);
        } catch (exc) {
          handlerPath = './handlers/four-oh-four.js';
        }

        try {
          // eslint-disable-next-line global-require
          const { handle } = require(handlerPath);
          handle(bundle, errorHandler);
          // handlers are responsible for calling res.end().
        } catch (exc) {
          errorHandler(exc);
        }
      },
      (exc) => {
        logStructured(null);
        errorHandler({ errorMessage: `${ exc }` });
      });
  }
}

module.exports.start = start;
