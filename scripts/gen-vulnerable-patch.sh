#!/bin/bash

# Builds a variant of the target server but with protective measures disabled.
#
# Usually run thus:
# ./scripts/gen-vulnerable-patch.sh > vulnerable.patch

set -e

source_files="$(
    git check-ignore -n -v --no-index \
        $( find lib -type f | grep -v lib/framework;
           echo package.json main.js scripts/run-locally.js static/* ) \
    | perl -ne 'print "$1\n" if m/^::\t(.*)/' | sort
)"

(
  for f in $source_files; do
    diff -u "$f" vulnerable/"$f" || true
  done
)
