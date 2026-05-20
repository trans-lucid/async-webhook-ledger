#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/candidate"

npm ci
docker compose config >/tmp/async-webhook-ledger-compose-config.txt
docker compose up -d

cleanup() {
  docker compose down -v
}
trap cleanup EXIT

make seed

set +e
npm run test:public:integration 2>&1 | tee /tmp/async-webhook-ledger-integration-output.txt
status=${PIPESTATUS[0]}
set -e

if [ "$status" -eq 0 ]; then
  echo "candidate starter unexpectedly passed the Docker-backed public integration test"
  exit 1
fi

if ! grep -q "drains duplicate SQS messages through Postgres and WireMock exactly once" /tmp/async-webhook-ledger-integration-output.txt; then
  echo "Docker-backed public integration test did not run"
  exit 1
fi

if ! grep -q "duplicate_deliveries" /tmp/async-webhook-ledger-integration-output.txt; then
  echo "Docker-backed public integration test failed for an unexpected reason"
  exit 1
fi

echo "candidate starter failed Docker-backed public integration test as expected"
