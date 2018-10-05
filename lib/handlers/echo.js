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
 * Assuming you've started the server at localhost:8080, going to
 * http://localhost:8080/echo?a=foo&b=bar&c=baz will send a request like
 * `SELECT ('foo' AS "a", 'bar' AS "b", 'baz' AS "c")` to the database.
 *
 * You can use this to easily test out some safesql bypasses.
 * Feel free to hack the structure here to try out other hacks
 */

const template = require('./echo.pug');
const safesql = require('safesql');

exports.handle = ({ reqUrl, res, database, cspNonce }, handleError) => {
  const inputs = Array.from(reqUrl.searchParams.entries());
  if (!inputs.length) {
    // Make sure just visiting /echo doesn't barf with a SQL error.
    inputs.push([ 'Hello', 'World' ]);
  }

  function finish(failure, result) {
    if (failure) {
      handleError(failure);
    } else {
      res.statusCode = 200;
      res.end(template({ cspNonce, result, failure }));
    }
  }

  database.connect()
    .then((client) => {
      const query = safesql.pg`SELECT ${
        inputs.map(([ name, value ]) => safesql.pg`${ value } AS "${ name }"`) }`;
      // eslint-disable-next-line no-console
      console.log(`echo sending ${ query }`);
      client.query(query)
        .then(
          (resultSet) => {
            client.release();
            finish(null, Object.entries(resultSet.rows[0]));
          })
        .catch((exc) => {
          client.release();
          finish(exc, null);
        });
    })
    .catch((exc) => {
      finish(exc, null);
    });
};
