#!./bin/node

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

/**
 * @fileoverview
 * Command line script that spawns a Postgres server and a web frontend
 * and introduces the two.
 */

/* eslint id-blacklist: 0, no-magic-numbers: 0, no-sync: 0, no-console: 0 */

'use strict';

const childProcess = require('child_process');
// eslint-disable-next-line id-length
const fs = require('fs');
const path = require('path');
const process = require('process');
const randomNumber = require('random-number-csprng');

const rootDir = path.resolve(path.join(__dirname, '..'));

// Like perls x"..."
function x(command, ...args) {
  const { status, signal, error, stdout } = childProcess.spawnSync(
    command, args,
    {
      shell: false,
      encoding: 'utf8',
      stdio: [ 'ignore', 'pipe', 'inherit' ],
    });
  if (status || signal || error) {
    process.exitCode = 1;
    throw new Error(`Command ${ command } ${ args.join(' ') } failed: ${ JSON.stringify({ status, signal, error }) }`);
  }
  return stdout;
}

function mkdirp(dir) {
  x('mkdir', '-p', '-m', '0700', dir);
  return dir;
}

function rmrf(dir) {
  x('rm', '-rf', '--', dir);
}

/**
 * Initializes an empty Postgres database that lets user webfe
 * connect via a UNIX socket visible to the current POSIX user.
 *
 * @param onceDatabaseStarted receives a bunch of file-system
 *    metadata about the database and a teardown method.
 */
function spinUpDatabase(onceDatabaseStarted) {
  // Make sure postgres is on the path
  const postgresExec = x('which', 'postgres').replace(/\n$/, '');

  const pgDir = path.join(rootDir, 'pg');

  // HACK: This probably doesn't work on Windows.  Probably none of this does.
  const pgSocksDir = mkdirp(path.join(pgDir, 'socks'));

  // Skipping [0, 1000) lets us avoid leading zero problems.
  randomNumber(1000, 9999).then(
    (counterStart) => {
      const pgInfo = (() => {
        for (let i = counterStart; (i = (i + 1) % 10000) !== counterStart;) {
          let ext = String(i);
          ext = `${ '0000'.substring(ext.length) }${ ext }`;
          const socketFile = path.join(pgSocksDir, `.s.PGSQL.${ ext }`);
          if (!fs.existsSync(socketFile)) {
            return {
              pgSockFile: socketFile,
              pgPort: ext,
            };
          }
        }
        throw new Error('Unable to find free socket');
      })();
      // eslint-disable-next-line no-use-before-define
      onceSocketAllocated(pgInfo);
    });

  let dbProcess = null;
  let pgDataDir = null;
  let pgLogsDir = null;
  let stdoutFd = null;
  let stderrFd = null;

  function teardown() {
    if (dbProcess !== null) {
      dbProcess.kill('SIGINT');
      dbProcess = null;
    }
    if (stdoutFd !== null) {
      fs.closeSync(stdoutFd);
      stdoutFd = null;
    }
    if (stderrFd !== null) {
      fs.closeSync(stderrFd);
      stderrFd = null;
    }
    if (pgDataDir !== null) {
      try {
        rmrf(pgDataDir);
      } catch (exc) {
        // best effort
      }
      pgDataDir = null;
    }
    if (pgLogsDir !== null) {
      try {
        rmrf(pgLogsDir);
      } catch (exc) {
        // best effort
      }
      pgLogsDir = null;
    }
  }
  process.on('beforeExit', teardown);

  function onceSocketAllocated({ pgSockFile, pgPort }) {
    pgDataDir = mkdirp(path.join(pgDir, pgPort, 'data'));
    pgLogsDir = mkdirp(path.join(pgDir, pgPort, 'logs'));

    x(path.join(path.dirname(postgresExec), 'initdb'),
      // Data directory
      '-D', pgDataDir,
      // Encoding
      '-E', 'utf8',
      // Root user name
      '-U', 'webfe');

    // Spin up a database instance
    stdoutFd = fs.openSync(path.join(pgLogsDir, 'stdout.txt'), 'w', 0o0600);
    stderrFd = fs.openSync(path.join(pgLogsDir, 'stderr.txt'), 'w', 0o0600);
    {
      const pgArgs = [
        /* eslint-disable array-element-newline */
        // Verbosity
        '-d', '3',
        // Data directory
        '-D', pgDataDir,
        // Socket directory
        '-k', pgSocksDir,
        // Port
        '-p', pgPort,
        /* eslint-enable array-element-newline */
      ];

      dbProcess = childProcess.spawn(
        postgresExec,
        pgArgs,
        {
          shell: false,
          stdio: [ 'ignore', stdoutFd, stderrFd ],
        });
      console.log(`Database starting on ${ pgSockFile } and logging to ${ pgLogsDir }.std{err,out}`);
      console.log(`To connect locally: psql -h ${ path.dirname(pgSockFile) } -p ${ pgPort } postgres webfe`);
    }

    // Wait until the socket file is apparent in the file system.
    // TODO: timeout?
    let watcher = null;
    let spunup = false;
    function onceSocketAvailable() {
      if (spunup) {
        return;
      }
      spunup = true;
      onceDatabaseStarted({
        pgSockFile, pgPort, pgSocksDir, pgDataDir, pgLogsDir, teardown,
      });
    }

    function checkSock() {
      fs.exists(pgSockFile, (exists) => {
        if (exists) {
          onceSocketAvailable();
          if (watcher) {
            watcher.close();
          }
        }
      });
    }

    watcher = fs.watch(path.dirname(pgSockFile), {}, checkSock);
    // In case it's already there.
    checkSock();
  }
}


if (require.main === module) {
  spinUpDatabase(
    ({ pgPort, pgSocksDir }) => {
      // Run the server main file
      const serverProcess = childProcess.spawn(
        path.join(rootDir, 'main.js'),
        process.argv.slice(2),
        {
          shell: false,
          stdio: 'inherit',
          env: Object.assign(
            Object.create(null),
            // eslint-disable-next-line no-process-env
            process.env,
            {
              // https://node-postgres.com/features/connecting
              PGUSER: 'webfe',
              PGHOST: pgSocksDir,
              PGPORT: pgPort,
              PGPASSWORD: '',
              PGDATABASE: 'postgres',
            }),
        });
      process.on('beforeExit', () => serverProcess.kill());
    });
}

module.exports = { spinUpDatabase };

// :)
