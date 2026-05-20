# Source Dossier: Async Webhook Ledger

This template is original Translucid-owned code. Public sources may be studied for architecture patterns only.

## Sources To Study

- Temporal workflow retry and recovery concepts
- LocalStack local SQS development patterns
- Stripe webhook delivery semantics and idempotency concepts
- WireMock HTTP failure simulation
- Postgres uniqueness and transaction patterns

## Allowed Reuse

- generic event-ledger architecture
- local emulator composition
- public terminology such as webhook, idempotency key, retry, queue redelivery
- general test ideas around duplicate delivery, out-of-order events, and provider timeouts

## Not Allowed

- copying public repo code
- copying proprietary startup source
- copying real customer payloads
- using real provider credentials
- placing hidden evaluator material on candidate main
