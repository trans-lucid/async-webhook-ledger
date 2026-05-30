#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
npm install
npx vitest run solution/tests/reference.test.ts evaluator/tests_hidden/hidden.test.ts
