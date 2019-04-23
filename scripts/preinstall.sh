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

    NODE_BUILD_PARENT="$PROJECT_ROOT/bin/node.d"
    NODE_BUILD_DIR="$NODE_BUILD_PARENT/node"

    if ! [ -x "$PROJECT_ROOT/bin/node" ]; then

        [ -d "$NODE_BUILD_PARENT" ]
        rm -rf "$NODE_BUILD_DIR"

        (
            pushd "$NODE_BUILD_PARENT"
            git clone https://github.com/nodejs/node.git node
            pushd "$NODE_BUILD_DIR"
            # 2019-04-11, Version 11.14.0
            git reset --hard cd026f8226e18b8b0f1e1629353b366187a96b42
            patch -p1 < "$NODE_BUILD_PARENT/node.patch"
            ./configure
            make -j4
            popd
            popd
        )

        cp "$NODE_BUILD_DIR"/node "$PROJECT_ROOT"/bin/

        # Pack npm
        pushd "$NODE_BUILD_DIR/deps/npm"
        NPM_TARBALL="$(bin/npm-cli.js pack | tail -1)"
        popd
    fi

    [ -x "$PROJECT_ROOT/bin/node" ]

    if ! [ -x "$PROJECT_ROOT/bin/npm" ]; then
        # Install an NPM that uses the built node locally.
        "$NODE_BUILD_DIR/deps/npm/bin/npm-cli.js" install --no-save "$NODE_BUILD_DIR/deps/npm/$NPM_TARBALL"
        rm -f bin/npm
        ln -s "$PROJECT_ROOT/node_modules/.bin/npm" bin/npm
    fi

    [ -x "$PROJECT_ROOT/bin/npm" ]

    # Sanity check our patched version of node.
    [[ "true" == "$("$PROJECT_ROOT/bin/node" -e 'console.log(typeof require.moduleKeys.publicKey === `function`)')" ]]
fi
