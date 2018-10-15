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
  publicurl       varchar,
  created         timestamp DEFAULT current_timestamp
);

-- Relate server session nonces to Accounts.
CREATE TABLE IF NOT EXISTS Sessions (
  -- 256b base64 encoded
  sessionnonce    char(44)  PRIMARY KEY,
  aid             integer,
  created         timestamp DEFAULT current_timestamp
);

-- Relates private user info to account ids.
CREATE TABLE IF NOT EXISTS PersonalInfo (
  aid             integer   UNIQUE,
  realname        varchar,
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
  ( aid,          displayname, displaynamehtml,                                   publicurl )
VALUES
  ( x'Ada'::int,  'Ada',       NULL,                                              NULL ),
  ( x'B0b'::int,  NULL,        'Bob<script>document.write(" with a 0")</script>', 'javascript:alert(1)' ),
  ( x'Deb'::int,  NULL,        '<b>D</b>eb',                                      'https://deb.example.com/' ),
  ( x'Fae'::int,  'Fae',       '<font color=green>Fae</font>',                    'mailto:fae@fae.fae' )
;

INSERT INTO PersonalInfo
  ( aid,          realname,            email )
VALUES
  ( x'Ada'::int,  'Ada Lovelace',      'ada@example.com' ),
  ( x'B0b'::int,  'Bob F. NULL',       'Bob <script/src=http&#58//@evil.com>' ),
  ( x'Deb'::int,  'Deborah Testdata',  'debtd@aol.com' ),
  ( x'Fae'::int,  'Fae O''Postrophey', 'fae@example.com.' )
;

INSERT INTO Posts
  ( author,       public, created,               bodyhtml )
VALUES
  ( x'Ada'::int,  true,   '2018-10-05 12:00:00', 'Hi!  My name is <b>Ada</b>.  Nice to meet you!' ),
  ( x'B0b'::int,  true,   '2018-10-06 12:00:00', '</div></span></table></div>Ada, <script>alert("Hi!")</script>!' ),
  ( x'Deb'::int,  true,   '2018-10-07 12:00:00', '<b>&iexcl;Hi, all!</b>' ),
  ( x'Deb'::int,  false,  '2018-10-08 12:00:00', 'Bob, I''m browsing via Lynx and your post isn''t Lynx-friendly.' ),
  ( x'Fae'::int,  true,   '2018-10-09 12:00:00', 'Sigh!  Yet another Facebook.com knockoff without any users.' ),
  ( x'Fae'::int,  true,   '2018-10-10 12:00:00', '(It is probably insecure)' ),
  ( x'B0b'::int,  false,  '2018-10-11 12:00:00', 'You think?' )
;

INSERT INTO Friendships
  ( leftaid,      rightaid )
VALUES
  ( x'Ada'::int,  x'Ada'::int ),
  ( x'Deb'::int,  x'B0b'::int ),
  ( x'B0b'::int,  x'Ada'::int ),
  ( x'B0b'::int,  x'Deb'::int ),
  ( x'B0b'::int,  x'Fae'::int ),
  ( x'Ada'::int,  x'Fae'::int ),
  ( x'Fae'::int,  x'Ada'::int )
;
`;


const dropStmts = (() => {
  const createSql = initStmts.content;
  const tableNamePattern = /^CREATE (TABLE|INDEX) IF NOT EXISTS (\w+)/mg;

  let dropSql = null;
  for (let match; (match = tableNamePattern.exec(createSql));) {
    const [ , type, name ] = match;
    const canonName = name.toLowerCase();
    const dropStmt = type.toUpperCase() === 'INDEX' ?
      safesql.pg`DROP INDEX IF EXISTS "${ canonName }"` :
      safesql.pg`DROP TABLE IF EXISTS "${ canonName }"`;
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
