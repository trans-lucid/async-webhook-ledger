# Async Webhook Ledger

This service processes webhook-style events from an external provider. The happy path works, but production incidents showed duplicate side effects, confusing retries, and missing operator context.

Fix the production path so event processing is idempotent, durable, and explainable.

## Commands

```bash
make dev
make seed
make test
make run
make clean
```

`make dev` starts Postgres, LocalStack SQS, WireMock, and MailHog. The app must not require real cloud credentials.

## Focus Areas

- `src/eventLedger.ts`: receipt, uniqueness, and event status
- `src/handlers.ts`: business state transitions and side effects
- `src/reconciliation.ts`: operator-readable summary
- `src/queueConsumer.ts`: redelivery-safe processing

## Public Test Contract

Public tests verify the basics: duplicate suppression, invalid event rejection, out-of-order recovery, and reconciliation output shape. Hidden tests add concurrent delivery, provider timeout ambiguity, worker crash redelivery, and harder event streams.
