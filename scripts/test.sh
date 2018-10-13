#!/bin/bash

set -e

# Make a directory for the production source list
mkdir -p generated

# Generate the production source list
# Run the tests once to make sure we have an up-to-date production source list,
# and if there are failures and the production source list changed, rerun.
PROD_SOURCE_LIST=
PROD_MASTER_HASH=
if [ -f generated/prod-sources.json ]; then
    PROD_MASTER_HASH="$(shasum -a 256 generated/prod-sources.json)"
fi
if ! scripts/generate-production-source-list.js generated/prod-sources; then
    NEW_PROD_MASTER_HASH="$(shasum -a 256 generated/prod-sources.json)"
    if [[ "$PROD_MASTER_HASH" != "$NEW_PROD_MASTER_HASH" ]]; then
        echo Rerunning tests with updated production source list
        echo . "$PROD_MASTER_HASH" '->' "$NEW_PROD_MASTER_HASH"
        scripts/generate-production-source-list.js generated/prod-sources
    else
        exit 1
    fi
fi

if [[ "$TRAVIS" != "true" ]]; then
    # Sanity check the server by starting it, and then tell it to hangup.
    echo Starting server
    ./main.js --noinitdb &
    main_pid="$!"
    # Spawn a fire-and-forget subprocess to stop the server from listening forever.
    (
        sleep 3
        kill -s INT "$main_pid"
    ) &
    hup_pid="$!"
    wait "$main_pid"  # Wait for the server to exit
    server_result="$?"
    kill "$hup_pid" >& /dev/null || true
    if [[ "$server_result" != "0" ]]; then
        echo 'FAILED: Server smoke test'
        exit "$server_result"
    fi
    echo 'PASSED: Server smoke test'
fi
