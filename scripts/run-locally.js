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
    throw new Error(`Command ${ command } failed: ${ JSON.stringify({ status, signal, error }) }`);
  }
  return stdout;
}

function mkdirp(dir) {
  x('mkdir', '-p', '-m', '0700', dir);
  return dir;
}

// Make sure postgres is on the path
const postgresExec = x('which', 'postgres').replace(/\n$/, '');

const pgDir = path.join(rootDir, 'pg');

// Does this need to go under \\?\pipe on Windows?
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

function onceSocketAllocated({ pgSockFile, pgPort }) {
  const pgDataDir = mkdirp(path.join(pgDir, pgPort, 'data'));
  const pgLogsDir = mkdirp(path.join(pgDir, pgPort, 'logs'));

  x(path.join(path.dirname(postgresExec), 'initdb'),
    // Data directory
    '-D', pgDataDir,
    // Encoding
    '-E', 'utf8',
    // Root user name
    '-U', 'webfe');

  // Spin up a database instance
  let dbProcess = null;
  {
    const stdoutFd = fs.openSync(path.join(pgLogsDir, 'stdout.txt'), 'w', 0o0600);
    const stderrFd = fs.openSync(path.join(pgLogsDir, 'stderr.txt'), 'w', 0o0600);
    process.on('beforeExit', () => {
      fs.close(stdoutFd);
      fs.close(stderrFd);
    });

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
    process.on('beforeExit', () => dbProcess.kill());
    console.log(`Database starting on ${ pgSockFile } and logging to ${ pgLogsDir }.std{err,out}`);
  }
  // TODO: maybe watch for the existence of the socket file instead of sleeping.
  setTimeout(
    // eslint-disable-next-line no-use-before-define
    () => onceDatabaseStarted({ pgSockFile, pgPort }),
    // ms
    1000);
}

function onceDatabaseStarted({ pgSockFile, pgPort }) {
  // Run the server main file
  const serverProcess = childProcess.spawn(
    path.join(rootDir, 'main.js'),
    // 0 -> Pick a free port
    [ '127.0.0.1', '0', rootDir, pgSockFile ],
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
}
