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
 * Modifies the postgres library to intercept calls to query and check that the
 * query string is a SafeSQL fragment.
 *
 * SqlFragments are produced by the safesql library, so by ensuring that pg
 * checks for SqlFragments and using node-sec-patterns to control which modules
 * we can bound the amount of code that might be at fault in a SQL injection.
 */

// TODO: This is destructive to pg.
// Ask AJVincent / Tom Van Cutsem if we can just use
// https://github.com/ajvincent/es-membrane to non-destructively intercept
// calls to Query and maybe to guard access to Client.queryQueue and internal
// methods.

// SENSITIVE - Trusted to mutate database tables.
// GUARANTEE - Exports an API that is a subset of that provided by package pg
// but which only issues messages to the database whose content is part of a
// SqlFragment minted by an authorized minter.

const { apply } = Reflect;
// eslint-disable-next-line id-length
const pg = require('pg');
const { Mintable } = require('node-sec-patterns');
const { SqlFragment } = require('safesql');

const isSqlFragment = Mintable.verifierFor(SqlFragment);

const { query: originalQuery } = pg.Client.prototype;
pg.Client.prototype.query = function query(...argumentList) {
  const [ argument0 ] = argumentList;
  if (!isSqlFragment(argument0)) {
    throw new TypeError('Expected SqlFragment');
  }
  argumentList[0] = argument0.content;
  return apply(originalQuery, this, argumentList);
};
// Deny direct access to Query.
pg.Query = null;

module.exports = pg;
