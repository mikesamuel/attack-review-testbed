#!/bin/bash

set -e

# Make a directory for the production source list
mkdir -p generated

# Generate the production source list
scripts/generate-production-source-list.js generated/prod-sources

# Sanity check the server by starting it, and then tell it to hangup.
echo Starting server
./main.js &
main_pid="$!"
# Spawn a fire-and-forget subprocess to stop the server from listening forever.
(
    sleep 1
    kill -s INT "$main_pid" >& /dev/null
) &
hup_pid="$!"
wait "$main_pid"  # Wait for the server to exit
server_result="$?"
kill "$hup_pid" >& /dev/null || true
exit "$server_result"
