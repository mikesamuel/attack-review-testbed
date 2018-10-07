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
const { after, describe, it } = require('mocha');
const safesql = require('safesql');

const { createTables, clearTables, initializeTablesWithTestData } =
  require('../lib/db-tables.js');

module.exports = (dbErr, makePool, doneWithDb) => {
  describe('db-tables', () => {
    after(doneWithDb);

    it('createTables', (done) => {
      if (dbErr) {
        done(dbErr);
        return;
      }
      const pool = makePool();
      function finish(exc) {
        pool.end();
        if (exc) {
          return done(exc);
        }
        return done();
      }
      function finishErr(exc) {
        finish(exc || new Error());
      }

      function checkAccountsTable(client) {
        client.query(safesql.pg`SELECT * FROM Accounts`).then(
          ({ rowCount, fields }) => {
            client.release();
            try {
              expect({ rowCount, fields: fields.map(({ name }) => name) })
                .to.deep.equals({
                  rowCount: 0,
                  fields: [ 'aid', 'displayname', 'displaynamehtml', 'created' ],
                });
            } catch (exc) {
              finish(exc);
              return;
            }
            finish();
          },
          (exc) => {
            client.release();
            finishErr(exc);
          });
      }
      setTimeout(
        () => {
          createTables(pool).then(
            () => {
              pool.connect().then(
                checkAccountsTable,
                finishErr);
            },
            finishErr);
        },
        // eslint-disable-next-line no-magic-numbers
        50);
    });

    it('clearTables', () => {
      // TODO
      expect(clearTables).to.not.equal(null);
    });
    it('initializeTablesWithTestData', () => {
      // TODO
      expect(initializeTablesWithTestData).to.not.equal(null);
    });
  });
};
