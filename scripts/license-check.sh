#!/bin/bash

set -e

MISSING="$(find lib scripts test -name \*.js | xargs grep -c 'Apache' | perl -ne 'print if s/:0$//')"

if [ -n "$MISSING" ]; then
    echo Need license headers in
    echo "$MISSING"
    exit 1
fi
