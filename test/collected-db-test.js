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

const { after, before } = require('mocha');
const { spinUpDatabase } = require('../scripts/run-locally.js');
const dbTablesTest = require('./db-tables-test.js');
const endToEndTest = require('./end-to-end-test.js');
const { Pool } = require('../lib/safe/pg.js');

function noop() {
  // This function body left intentionally blank.
}

const testsThatRequireDb = [ dbTablesTest, endToEndTest ];

const { release, withDbConfig } = (() => {
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
    release() {
      // We don't need to wait for inflight database-using tasks to finish
      // before teardown since mocha describe() does that for us.
      setTimeout(
        () => {
          if (teardownFun) {
            teardownFun();
          }
        },
        // Wait a little bit.
        // TODO: Figure out why init-hooks-test fail with errors about
        // a connection closing hard due to the interrupting of the
        // DB server process.
        // ravis-ci.org/mikesamuel/attack-review-testbed/jobs/438005939#L528
        // eslint-disable-next-line no-magic-numbers
        250);
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

function makePoolPromise() {
  return new Promise((resolve, reject) => {
    withDbConfig(
      (dbConfigErr, dbConfig) => {
        if (dbConfigErr) {
          reject(dbConfigErr);
        } else {
          resolve(new Pool(dbConfig));
        }
      });
  });
}

for (let i = 0, { length } = testsThatRequireDb; i < length; ++i) {
  const test = testsThatRequireDb[i];
  test(
    makePoolPromise);
}

before(() => withDbConfig(noop));
after(release);
