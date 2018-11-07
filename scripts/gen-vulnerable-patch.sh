#!/bin/bash

# Builds a variant of the target server but with protective measures disabled.

set -e

# This should match the same lines in build-vulnerable.sh
source_files="$(
    git check-ignore -n -v --no-index \
        $( find lib -type f | grep -v lib/framework;
           echo package.json main.js scripts/run-locally.js static/* ) \
    | perl -ne 'print "$1\n" if m/^::\t(.*)/' | sort
)"

(
    for f in $source_files node_modules/pug-require/index.js; do
        diff -u "$f" vulnerable/"$f" || true
    done
) | perl -pe 's/^((?:\+\+\+|---) .*)\t\d{4}-\d\d?-\d\d? \d\d?:\d\d?:\d\d?[.]\d+ [+\-]\d+$/$1\t2000-01-01 12:00:00.000000000 -0500/' \
  > vulnerable.patch

# This should match the same lines in build-vulnerable.sh
hash_from="$(
    shasum -ba 1 vulnerable.patch $source_files
)"

if [ -d vulnerable/ ]; then
    echo -n "$hash_from" > vulnerable/patch-base.sha1
fi
