#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../candidate"
npm install

set +e
npm run test:public:unit
status=$?
set -e

if [ "$status" -eq 0 ]; then
  echo "candidate starter unexpectedly passed public unit tests"
  exit 1
fi

echo "candidate starter failed public unit tests as expected"
