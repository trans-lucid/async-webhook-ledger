#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
make setup
if ! find evaluator/tests_hidden -name '*.test.ts' -print -quit | grep -q .; then
  echo "no hidden tests discovered" >&2
  exit 1
fi
if [ -d src ]; then
  TARGET="$(pwd)/src/handlers.js"
else
  TARGET="$(pwd)/solution/src/handlers.js"
fi
EVAL_TARGET="$TARGET" npx vitest run solution/tests/reference.test.ts evaluator/tests_hidden/hidden.test.ts
