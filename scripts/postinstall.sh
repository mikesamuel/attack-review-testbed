#!/bin/bash

set -e
set -x

# Apply some patches to workaround issues.

pushd "$(dirname "$(dirname "$0")")" > /dev/null
PROJECT_ROOT="$PWD"
popd > /dev/null

[ -f "$PROJECT_ROOT"/package.json ]

pushd "$PROJECT_ROOT" > /dev/null
PATCHES_DIR="$PROJECT_ROOT/patches"
if grep -q eval "$PROJECT_ROOT/node_modules/depd/index.js"; then
    # Update to (unreleased as of this writing) depd version 2.0.0 which
    # uses `new Function` instead of `eval` to create an arity-matching
    # function wrapper.
    # lib/framework/code-loading-function-proxy.js allows version 2.0.0
    # to run on a node runtime with --disallow_code_generation_from_strings
    # but eval-using version 1.1.2 cannot.
    #
    # The specific commit we need is
    # github.com/dougwilson/nodejs-depd/commit/887283b41c43d98b8ee8e8110d7443155de28682#diff-e1bbd4f15e3b63427b4261e05b948ea8
    patch -p1 < patches/node_modules-depd-index.patch
fi
if ! grep -q isExtensible "$PROJECT_ROOT/node_modules/fs-ext/fs-ext.js"; then
    patch -p1 < patches/node_modules-fsext-fsext.patch
fi
popd > /dev/null
