#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../candidate"
npm install
npm run test:public
