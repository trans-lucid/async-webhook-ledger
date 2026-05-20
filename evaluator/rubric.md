# Async Webhook Ledger Rubric

Total: 100 points.

## Correctness: 45

- 10: durable receipt of every valid, invalid, failed, and duplicate delivery
- 10: idempotency by stable provider event ID and side-effect key
- 10: correct out-of-order lifecycle reconciliation
- 10: safe retry after ambiguous provider timeout or worker crash
- 5: invalid payloads are rejected without crashing the worker

## Production Integration: 20

- 8: uses the database/queue path rather than a one-file helper bypass
- 5: uses transactional boundaries or uniqueness constraints for concurrency
- 4: preserves local simulator commands
- 3: no external credentials or cloud calls

## Operator Visibility: 15

- 6: reconciliation summary includes duplicates, rejected, failed, and pending states
- 5: support-facing notes are specific and actionable
- 4: logs or status fields preserve enough context for incident review

## Test Quality: 10

- 5: adds focused tests for idempotency and out-of-order behavior
- 3: covers provider timeout or retry ambiguity
- 2: avoids fixture hardcoding

## Debrief: 10

- 4: explains the root cause accurately
- 3: states the new guarantees and remaining tradeoffs
- 3: describes operational recovery behavior clearly

Strong solutions must pass hidden tests without special-casing public fixture IDs.
