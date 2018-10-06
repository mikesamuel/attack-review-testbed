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

/* eslint id-blacklist: 0, no-multi-str: 0, no-magic-numbers: 0 */

const { expect } = require('chai');
const { after, describe, it } = require('mocha');

const path = require('path');
const process = require('process');
const request = require('request');
const { URL } = require('url');
const { startIntercept, stopIntercept } = require('capture-console');
const { spinUpDatabase } = require('../scripts/run-locally.js');

const { start } = require('../lib/server.js');

const hostName = '127.0.0.1';
const rootDir = path.resolve(path.join(__dirname, '..'));

function noop() {
  // This function body left intentionally blank.
}

const { withDbConfig, teardownDb } = (() => {
  let pending = null;
  let dbConfig = null;
  let failure = null;
  let teardownFun = null;

  function scheduleToRun(...onDbAvailable) {
    for (const fun of onDbAvailable) {
      setTimeout(fun.bind(null, failure, dbConfig), 0);
    }
  }

  function maybeRunPending() {
    const toNotify = pending;
    pending = null;
    if (toNotify) {
      scheduleToRun(...toNotify);
    }
  }

  return {
    teardownDb() {
      // We don't need to wait for inflight database-using tasks to finish
      // before teardown since mocha describe() does that for us.
      setTimeout(
        () => {
          if (teardownFun) {
            teardownFun();
          }
        }, 0);
    },
    withDbConfig(onDbAvailable) {
      if (pending) {
        // Wait in line.
        pending.push(onDbAvailable);
      } else if (dbConfig) {
        scheduleToRun(onDbAvailable);
      } else {
        pending = [ onDbAvailable ];
        try {
          spinUpDatabase(({ pgSocksDir, pgPort, teardown }) => {
            dbConfig = {
              user: 'webfe',
              host: pgSocksDir,
              port: pgPort,
              database: 'postgres',
            };
            process.on('beforeExit', teardown);

            teardownFun = teardown;

            maybeRunPending();
          });
        } catch (exc) {
          teardownFun = noop;
          failure = exc;
          maybeRunPending();
        }
      }
    },
  };
})();

function withServer(onStart) {
  let i = 0;
  function notReallyUnguessable() {
    const str = `${ i++ }`;
    return 'x'.repeat(32 - str.length) + str;
  }

  withDbConfig((dbConfigErr, dbConfig) => {
    if (dbConfigErr) {
      onStart(dbConfigErr, new URL('about:invalid'), noop, () => ({}));
      return;
    }
    let stdout = '';
    let stderr = '';
    startIntercept(process.stdout, (chunk) => {
      stdout += chunk;
    });
    startIntercept(process.stderr, (chunk) => {
      stderr += chunk;
    });
    const { stop } = start(
      { hostName, port: 0, rootDir, dbConfig },
      (err, actualPort) => {
        const url = new URL(`http://${ hostName }:${ actualPort }`);
        onStart(
          err, url,
          () => {
            stop();
            stopIntercept(process.stderr);
            stopIntercept(process.stdout);
          },
          () => ({ stderr, stdout }));
      },
      notReallyUnguessable);
  });
}

function sessionCookieForResponse({ headers }) {
  const setCookies = headers['set-cookie'];
  if (setCookies) {
    for (const setCookie of setCookies) {
      const [ , session ] = /^session=([^;]*)/.exec(setCookie) || [];
      if (session) {
        return decodeURIComponent(session);
      }
    }
  }
  return void 0;
}

function serverTest(testName, testFun) {
  it(testName, (done) => {
    withServer((startErr, url, stop, logs) => {
      if (startErr) {
        done(startErr);
        return;
      }
      let closed = false;
      function closeAndEnd(closeErr) {
        if (!closed) {
          closed = true;
          stop(closeErr);
          if (closeErr) {
            return done(closeErr);
          }
          return done();
        }
        return null;
      }
      try {
        testFun(url, closeAndEnd, logs);
      } catch (exc) {
        closeAndEnd(exc);
        throw exc;
      }
    });
  });
}

function expects(assertions, done) {
  try {
    assertions();
  } catch (exc) {
    done(exc);
    return;
  }
  done();
}

describe('end-to-end', () => {
  after(() => {
    teardownDb();
  });

  serverTest('GET / OK', (baseUrl, done, logs) => {
    request(
      new URL('/', baseUrl).href,
      (err, response, body) => expects(
        () => {
          expect({
            err,
            statusCode: response && response.statusCode,
            body,
            logs: logs(),
          }).to.deep.equal({
            err: null,
            body: '<!DOCTYPE html><html><head><title>Attack Review Testbed</title>\
<script nonce="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx0" src="/common.js"></script>\
</head><body>\
TODO: write me, lazy programmer\
</body></html>',
            logs: {
              stderr: '',
              stdout: 'GET /\n',
            },
            statusCode: 200,
          });
          expect(sessionCookieForResponse(response)).to.not.equal(void 0);
        }, done));
  });

  // A static HTML file under ../static
  serverTest('GET /hello-world.html OK', (baseUrl, done, logs) => {
    request(
      new URL('/hello-world.html', baseUrl).href,
      (err, response, body) => expects(
        () => {
          expect({
            err,
            statusCode: response && response.statusCode,
            body,
            logs: logs(),
          }).to.deep.equal({
            err: null,
            statusCode: 200,
            body: '<!doctype html>\nHello, World!\n',
            logs: {
              stderr: '',
              stdout: '',
            },
          });
        }, done));
  });

  serverTest('GET /no-such-file OK', (baseUrl, done, logs) => {
    const target = new URL('/no-such-file', baseUrl).href;
    request(
      target,
      (err, response, body) => expects(
        () => {
          expect({
            err,
            statusCode: response && response.statusCode,
            body,
            logs: logs(),
          }).to.deep.equal({
            err: null,
            statusCode: 404,
            body: `<!DOCTYPE html><html><head><title>File Not Found:
/no-such-file</title>\
<script nonce="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx0" src="/common.js"></script>\
</head><body><p>Oops!  Nothing at
${ target }</p></body></html>`,
            logs: {
              stderr: '',
              stdout: 'GET /no-such-file\n',
            },
          });
        }, done));
  });

  serverTest('GET /echo OK', (baseUrl, done, logs) => {
    const target = new URL('/echo?a%22=b%27&foo=bar&baz', baseUrl).href;
    request(
      target,
      (err, response, body) => expects(
        () => {
          expect({
            err,
            statusCode: response && response.statusCode,
            body,
            logs: logs(),
          }).to.deep.equal({
            err: null,
            statusCode: 200,
            // eslint-disable-next-line quotes
            body: `<!DOCTYPE html><html><head><title>Database Echo</title>\
<script nonce="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx0" src="/common.js"></script>\
</head><body><table>\
<tr><th>a&#34;</th><th>foo</th><th>baz</th></tr>\
<tr><td>b&#39;</td><td>bar</td><td></td></tr>\
</table></body></html>`,
            logs: {
              stderr: '',
              stdout: (
                'GET /echo?a%22=b%27&foo=bar&baz\n' +
                'echo sending SELECT e\'b\'\'\' AS "a""", \'bar\' AS "foo", \'\' AS "baz"\n'),
            },
          });
        }, done));
  });
});
