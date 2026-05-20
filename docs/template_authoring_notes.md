# Template Authoring Notes

## Renderer Contract

The renderer should copy `candidate/` into generated candidate `main`, then render `README.md.j2` and `DEBRIEF.md.j2` with recruiter-selected context.

Private material must be kept out of candidate `main`:

- `solution/`
- `evaluator/tests_hidden/`
- `evaluator/fixtures_hidden/`
- `evaluator/rubric.md`
- `solution/SOLUTION.md.j2`
- `solution/expected/`

## Difficulty Tuning

Medium:

- duplicate delivery
- invalid event
- simple out-of-order delivery

Hard:

- concurrent duplicates
- provider timeout after side effect
- queue redelivery after process restart

Staff:

- multi-account reconciliation
- stale lifecycle state
- support-readable incident report
- strict database transaction and uniqueness expectations

## Local Simulator Guidance

Keep Docker Compose candidate-facing and predictable. Use Testcontainers only in hidden evaluator generation when the environment supports it.

Public integration coverage must include at least one test that exercises:

```txt
LocalStack SQS -> queueConsumer -> Postgres ledger -> WireMock provider -> reconciliation state
```

Fast unit tests are still useful, but they are not enough for this template to count as production-shaped.
