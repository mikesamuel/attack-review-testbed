#!/bin/bash

# Collects sanity checks for travis-ci.

set -e

npm run prepack
npm run license
