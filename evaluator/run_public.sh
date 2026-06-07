#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
make setup
npm run typecheck
npm run test:public:unit
