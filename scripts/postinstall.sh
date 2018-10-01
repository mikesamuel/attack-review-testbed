#!/bin/bash

set -e
set -x

# Checks out a specific version of node, patches it, and builds it.
# This version of node allows trusted require hooks to intercept
# code loads, and attaches keys to every user module loaded.
#
# This does not hijack any ambient credentials.  For reals!  Well, probably not.

pushd "$(dirname "$(dirname "$0")")" >& /dev/null
PROJECT_ROOT="$PWD"
popd >& /dev/null

[ -f "$PROJECT_ROOT"/package.json ]

if ! [ -x "$PROJECT_ROOT/bin/node" ]; then

    NODE_BUILD_PARENT="$PROJECT_ROOT/bin/node.d"
    NODE_BUILD_DIR="$NODE_BUILD_PARENT/node"

    [ -d "$NODE_BUILD_PARENT" ]
    rm -rf "$NODE_BUILD_DIR"

    (
        pushd "$NODE_BUILD_PARENT"
        git clone git@github.com:nodejs/node.git node
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
