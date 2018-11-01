#!/bin/bash

set -e
set -x

# Checks out a specific version of node, patches it, and builds it.
# This version of node allows trusted require hooks to intercept
# code loads, and attaches keys to every user module loaded.
#
# This does not hijack any ambient credentials.  For reals!  Well, probably not.

pushd "$(dirname "$(dirname "$0")")" > /dev/null
PROJECT_ROOT="$PWD"
popd > /dev/null

[ -f "$PROJECT_ROOT"/package.json ]

# Don't bother building the runtime for Travis which can run tests on a stock runtime
# docs.travis-ci.com/user/environment-variables/#default-environment-variables
if [[ "true" != "$TRAVIS" ]]; then

    if ! [ -x "$PROJECT_ROOT/bin/node" ]; then

        NODE_BUILD_PARENT="$PROJECT_ROOT/bin/node.d"
        NODE_BUILD_DIR="$NODE_BUILD_PARENT/node"

        [ -d "$NODE_BUILD_PARENT" ]
        rm -rf "$NODE_BUILD_DIR"

        (
            pushd "$NODE_BUILD_PARENT"
            git clone https://github.com/nodejs/node.git node
            pushd "$NODE_BUILD_DIR"
            git reset --hard edb03cb65d51e336713d6af1134a7394c0776635
            patch -p1 < "$NODE_BUILD_PARENT/node.patch"
            ./configure
            make -j4
            popd
            popd
        )

        cp "$NODE_BUILD_DIR"/node "$PROJECT_ROOT"/bin/
    fi

    [ -x "$PROJECT_ROOT/bin/node" ]

    # Sanity check our patched version of node.
    [[ "true" == "$("$PROJECT_ROOT/bin/node" -e 'console.log(typeof require.keys.publicKey === `function`)')" ]]
fi

# Apply some other patches to workaround issues.
PATCHES_DIR="$PROJECT_ROOT/patches"
if grep -q eval "$PROJECT_ROOT/node_modules/depd/index.js"; then
    pushd "$PROJECT_ROOT" > /dev/null
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
    popd > /dev/null
fi
