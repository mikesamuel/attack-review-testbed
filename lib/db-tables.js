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
 * Utilities to set up database tables needed by handlers/*.js, and
 * utilities to restore to known state for tests.
 */

const safesql = require('safesql');

const initStmts = safesql.pg`

-- Relate unique principle IDs to display info.
CREATE TABLE IF NOT EXISTS Accounts (
  aid             serial    PRIMARY KEY,
  displayname     varchar,
  displaynamehtml varchar,
  created         timestamp DEFAULT current_timestamp
);

-- Relate server session nonces to Accounts.
CREATE TABLE IF NOT EXISTS Sessions (
  sessionnonce    char(32)  PRIMARY KEY,
  aid             integer,
  created         timestamp DEFAULT current_timestamp
);

-- Relates private user info to account ids.
CREATE TABLE IF NOT EXISTS PersonalInfo (
  aid             integer   UNIQUE,
  realbame        varchar,
  email           varchar,
  created         timestamp DEFAULT current_timestamp
);
CREATE INDEX IF NOT EXISTS PersonInfo_aid ON PersonalInfo ( aid );

-- HTML snippets posted by users.
-- A post is visible if it is public or its
-- author and the viewer are friends.
CREATE TABLE IF NOT EXISTS Posts (
  pid             serial    PRIMARY KEY,
  author          integer   NOT NULL,  -- JOINs on aid
  bodyhtml        varchar   NOT NULL,
  public          bool      DEFAULT false,
  created         timestamp DEFAULT current_timestamp
);
CREATE INDEX IF NOT EXISTS Posts_aid ON Posts ( author );  -- For efficient account deletion
CREATE INDEX IF NOT EXISTS Posts_timestamp ON Posts ( created DESC );  -- For efficient display

-- A account is always friends with themself.
-- Per reciprocity, an account a is friends with account b if
-- there are both entries (a, b) and (b, a) in this table.
-- Every other pair of accounts are not friends :(
-- An account a owns all/only entries where its aid is in leftAid.
CREATE TABLE IF NOT EXISTS Friendships (
  fid             serial    PRIMARY KEY,
  leftaid         integer   NOT NULL,  -- JOINs on aid
  rightaid        integer   NOT NULL,  -- JOINs on aid
  created         timestamp DEFAULT current_timestamp
);
CREATE INDEX IF NOT EXISTS Friendships_leftaid ON Friendships ( leftaid );
CREATE INDEX IF NOT EXISTS Friendships_leftaid_rightaid ON Friendships ( leftaid, rightaid );

-- Arbitrary metadata about a post.
CREATE TABLE IF NOT EXISTS PostMetadata (
  pid             integer   NOT NULL,
  key             varchar   NOT NULL,
  value           varchar,
  created         timestamp DEFAULT current_timestamp
);
CREATE INDEX IF NOT EXISTS Postmetadata_pid ON PostMetadata ( pid );

`;

const cannedData = safesql.pg`
INSERT INTO Accounts
  ( aid,    displayname, displaynamehtml )
VALUES
  ( 0xAbe,  'Abe',     NULL ),
  ( 0xBef,  NULL,      'Bee<script>document.write(" with an F")</script>' ),
  ( 0xDeb,  NULL,      '<b>D</b>eb' ),
  ( 0xFae,  'Fae',     '<font color=green>Fae</font>' )
;

INSERT INTO PersonalInfo
  ( aid,    realname,            email )
VALUES
  ( 0xAbe,  'Abraham Example',   'abe@example.com' ),
  ( 0xBef,  'Bef F. NULL',       'Bef <script/src=http&#58//@evil.com>' ),
  ( 0xDeb,  'Deborah Testdata',  'debtd@aol.com' ),
  ( 0xFae,  'Fae O''Postrophey', 'fae@example.com.' )
;

INSERT INTO Posts
  ( author,  public, bodyhtml )
VALUES
  ( 0xAbe,   true,   'Hi!  I am <b>Abe</b>' ),
  ( 0xBef,   true,   '</div></span></table></div>Hi, Abe, <scriptalert("Nice to meet you!")</script>!' ),
  ( 0xDeb,   true,   '<h1>Hi, all!</h1>' ),
  ( 0xDeb,   false,  'Bef, I''m browsing bia Lynx and your post isn''t Lynx-friendly.' ),
  ( 0xFae,   true,   'Hi!  This looks like yet another Facebook knockoff without any user.' ),
  ( 0xFae,   true,   '(It is probably insecure)' ),
  ( 0xBef,   false,   'You think?' )
;

INSERT INTO Friendships
  ( leftaid, rightaid )
VALUES
  ( 0xAbe,   0xAbe ),
  ( 0xDeb,   0xBef ),
  ( 0xBef,   0xAbe ),
  ( 0xBef,   0xDeb ),
  ( 0xBef,   0xFae ),
  ( 0xAbe,   0xFae ),
  ( 0xFae,   0xAbe ),
`;


const dropStmts = (() => {
  const createSql = initStmts.content;
  const tableNamePattern = /^CREATE (TABLE|INDEX) IF NOT EXISTS (\w+)/mg;

  let dropSql = null;
  for (let match; (match = tableNamePattern.exec(createSql));) {
    const [ , type, name ] = match;
    const dropStmt = type.toUpperCase() === 'INDEX' ?
      safesql.pg`DROP INDEX IF EXISTS "${ name }"` :
      safesql.pg`DROP TABLE IF EXISTS "${ name }"`;
    dropSql = dropSql ?
      safesql.pg`${ dropSql };
${ dropStmt }` :
      dropStmt;
  }

  return dropSql;
})();

module.exports = {
  // eslint-disable-next-line no-use-before-define
  createTables, clearTables, initializeTablesWithTestData,
};

function promiseToRun(dbPool, sql) {
  return new Promise((resolve, reject) => {
    dbPool.connect().then(
      (client) => {
        client.query(sql).then(
          (x) => {
            client.release();
            resolve(x);
          },
          (exc) => {
            client.release();
            reject(exc);
          });
      },
      reject);
  });
}

function createTables(dbPool) {
  return promiseToRun(dbPool, initStmts);
}

function clearTables(dbPool) {
  return promiseToRun(dbPool, safesql.pg`${ dropStmts };${ initStmts }`);
}

function initializeTablesWithTestData(dbPool) {
  return promiseToRun(dbPool, safesql.pg`${ dropStmts };${ initStmts };${ cannedData }`);
}
