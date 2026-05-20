# Async Webhook Ledger Template

This is a Translucid internal challenge template, not a generated candidate repository.

It creates production-shaped backend challenges where candidates repair webhook/event processing under retries, duplicates, out-of-order delivery, ambiguous external side effects, and queue redelivery.

## What This Template Produces

Rendered candidate repos should contain:

- TypeScript backend starter code
- Postgres-backed event ledger and business state
- LocalStack SQS delivery queue
- WireMock external provider simulator
- MailHog support-notification sink
- deterministic public fixtures
- public tests only
- candidate-facing `README.md` and `DEBRIEF.md`

Rendered private evaluator material should contain:

- hidden tests
- hidden fixtures
- reference solution
- expected outputs
- rubric
- `SOLUTION.md`

The generated candidate `main` branch must not include hidden tests, evaluator fixtures, rubric files, or solution files.

## Local Template Validation

From this template root:

```bash
npm install
npm run validate
```

That command regenerates public and hidden fixtures, then verifies the reference implementation against public and hidden behavioral tests.

The Docker-backed public integration path is candidate-facing and runs from `candidate/`:

```bash
make dev
make seed
npm run test:public:integration
```

That integration test sends duplicate messages through LocalStack SQS, drains them through `queueConsumer`, persists state in Postgres, calls the WireMock provider, and asserts the production path suppresses duplicate side effects.

Template CI also runs:

```bash
npm run validate:docker-integration
```

That command starts Docker Compose, seeds the local simulator, runs the Docker-backed public integration test, and requires the unsolved starter to fail for the expected duplicate-delivery defect.

## Production Simulator

The candidate-facing simulator uses:

- `postgres` for the durable event ledger and business state
- `localstack` for SQS queue delivery and redelivery behavior
- `wiremock` for external provider timeouts, bad payloads, and slow responses
- `mailhog` for local support notification capture

No external credentials are required. Rendered challenges must use local fake credentials and local endpoints only.

## Challenge Shape

The candidate inherits a service that receives external webhook events and consumes queued deliveries. The current implementation is unsafe: duplicate deliveries can create duplicate business side effects, retries can corrupt state, out-of-order events can lose legitimate transitions, and operators cannot tell what happened after a failure.

The candidate must repair the production path across multiple files:

- ledger receipt and uniqueness
- event validation and rejection
- external side-effect idempotency
- business state transitions
- reconciliation report
- queue redelivery behavior

## Source Use Policy

This template may be personalized from a startup repo profile, but it must not copy startup source files. Personalization is limited to stack, business nouns, scenario names, fixture field names, README context, and hidden-test emphasis.
