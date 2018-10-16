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

Error.stackTraceLimit = 20;

const crypto = require('crypto');
const http = require('http');
const path = require('path');
const { URL } = require('url');

require('pug-require').reinstall();
const cookie = require('cookie');
const serveStatic = require('serve-static');
const { TrustedHTML } = require('web-contract-types');
const { handle: handleError } = require('./handlers/error.js');
const { getCurrentAccount } = require('./dbi.js');

function mintUnguessable(nBytes) {
  // 256 bits of websafe entropy
  // eslint-disable-next-line no-magic-numbers
  return crypto.randomBytes(nBytes || 32).toString('base64');
}

function setHeaders(res) {
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader(
    'Content-Security-Policy',
    'default-src none; img-src \'self\'; form-action none; report-uri /client-error');
}

function start({ hostName, port, rootDir, database }, onStart, unguessable = mintUnguessable) {
  const staticFileRoot = path.join(rootDir, 'static');
  const staticHandler = serveStatic(staticFileRoot, { setHeaders });

  const server = http.createServer(
    // eslint-disable-next-line no-use-before-define
    (req, res) => staticHandler(req, res, handleRequest.bind(null, req, res)));

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
    const nonce = cookie.parse(req.headers.cookie || '').session || unguessableFile();
    res.setHeader(
      'Set-Cookie',
      cookie.serialize('session', nonce,
        {
          sameSite: true,
          httpOnly: true,
          // seconds
          // eslint-disable-next-line no-magic-numbers
          maxAge: 7 * 24 * 60 * 60,
        }));
    return nonce;
  }

  function requireTrustedHTML(...chunks) {
    const html = TrustedHTML.concat(...(chunks.map(TrustedHTML.escape)));
    return TrustedHTML.is(html) ? html.content : ' ';
  }

  // Handles and end()s HTTP requests.
  function handleRequest(req, res) {
    // Ensure that the response body is trusted HTML chunks.
    const end = res.end.bind(res);
    const write = res.write.bind(res);
    res.end =
      (html, ...rest) =>
        (html || rest.length ? end(requireTrustedHTML(html), ...rest) : end());
    res.write = (html, ...rest) => write(requireTrustedHTML(html), ...rest);

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
      `default-src 'nonce-${ cspNonce }'; img-src 'self'; form-action 'self'; report-uri /client-error`);
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
        stop,
      },
      database,
      cspNonce,
      sessionNonce,
    };

    // Until a handler decides otherwise.
    res.statusCode = 500;

    const errorHandler = handleError.bind(null, bundle);

    getCurrentAccount(database, sessionNonce).then(
      (currentAccount) => {
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
      errorHandler);
  }
}

module.exports.start = start;
