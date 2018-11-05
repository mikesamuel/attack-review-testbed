#!/bin/bash

# Builds a variant of the target server but with protective measures disabled.

set -e

force=
if [[ "$1" == "-f" ]]; then
   force=1
   shift
fi

if [ -z "$force" ] && [ -d vulnerable/ ] && ! git diff --quiet vulnerable/; then
    echo "Changes to vulnerable/"
    exit 1
fi

source_files="$(
    git check-ignore -n -v --no-index \
        $( find lib -type f | grep -v lib/framework;
           echo package.json main.js scripts/run-locally.js static/* ) \
    | perl -ne 'print "$1\n" if m/^::\t(.*)/' | sort
)"

echo Deleting old vulnerable/
rm -rf vulnerable/

echo Copying files over
for f in $source_files; do

    mkdir -p vulnerable/"$(dirname "$f")"
    cp -r "$f" vulnerable/"$f"
done

rm -rf vulnerable/static/user-uploads

echo Copying node_modules
cp -r node_modules/ vulnerable/node_modules/

echo Patching
pushd vulnerable/ >& /dev/null
echo "#/bin/bash" > scripts/postinstall.sh

for f in node_modules/{module-keys,node-sec-patterns,safesql,sh-template-tag,web-contract-types}; do
    echo 'throw new Error(`kapow!`);' > $f/index.js
done

chmod +x scripts/postinstall.sh
patch -p0 < ../vulnerable.patch
popd >& /dev/null
