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

const { expect } = require('chai');
const { describe, it } = require('mocha');
const safesql = require('safesql');

const { createTables, clearTables, initializeTablesWithTestData } =
  require('../lib/db-tables.js');

module.exports = (makePool) => {
  function dbIt(name, withPool, withClient) {
    it(name, function dbTest(done) {
      // Setting up the database takes some time.
      // Times are in millis.
      // eslint-disable-next-line no-magic-numbers, no-invalid-this
      this.timeout(5000);
      // eslint-disable-next-line no-magic-numbers, no-invalid-this
      this.slow(500);

      makePool().then(
        (pool) => {
          let client = null;
          function finish(exc) {
            if (client) {
              client.release();
              client = null;
            }
            pool.end();
            if (exc) {
              return done(exc);
            }
            return done();
          }
          function finishErr(exc) {
            finish(exc || new Error());
          }

          function usePool(exc) {
            if (exc) {
              finish(exc);
              return;
            }
            pool.connect().then(
              (aClient) => {
                client = aClient;
                withClient(client, finish, finishErr);
              },
              finishErr);
          }

          setTimeout(
            () => withPool(pool, usePool, finishErr),
            // eslint-disable-next-line no-magic-numbers
            50);
        },
        (dbErr) => {
          done(dbErr || new Error());
        });
    });
  }

  describe('db-tables', () => {
    dbIt(
      'createTables',
      (pool, finish, finishErr) => createTables(pool).then(() => finish(), finishErr),
      (client, finish, finishErr) =>
        client.query(safesql.pg`SELECT * FROM Accounts`).then(
          ({ rowCount, fields }) => {
            try {
              expect({ rowCount, fields: fields.map(({ name }) => name) })
                .to.deep.equals({
                  rowCount: 0,
                  fields: [ 'aid', 'displayname', 'displaynamehtml', 'publicurl', 'created' ],
                });
            } catch (exc) {
              finish(exc);
              return;
            }
            finish();
          },
          finishErr));

    dbIt(
      'initializeTablesWithTestData',
      (pool, finish, finishErr) => initializeTablesWithTestData(pool).then(() => finish(), finishErr),
      (client, finish, finishErr) =>
        client.query(safesql.pg`SELECT * FROM Accounts`).then(
          ({ rowCount, fields }) => {
            try {
              expect({ rowCount, fields: fields.map(({ name }) => name) })
                .to.deep.equals({
                  rowCount: 4,
                  fields: [ 'aid', 'displayname', 'displaynamehtml', 'publicurl', 'created' ],
                });
            } catch (exc) {
              finish(exc);
              return;
            }
            finish();
          },
          finishErr));

    dbIt(
      'clearTables',
      (pool, finish, finishErr) => clearTables(pool).then(() => finish(), finishErr),
      (client, finish, finishErr) =>
        client.query(safesql.pg`SELECT * FROM Accounts`).then(
          ({ rowCount, fields }) => {
            try {
              expect({ rowCount, fields: fields.map(({ name }) => name) })
                .to.deep.equals({
                  rowCount: 0,
                  fields: [ 'aid', 'displayname', 'displaynamehtml', 'publicurl', 'created' ],
                });
            } catch (exc) {
              finish(exc);
              return;
            }
            finish();
          },
          finishErr));
  });
};
