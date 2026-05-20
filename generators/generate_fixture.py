#!/usr/bin/env python3
"""Generate deterministic webhook fixture streams for the template.

The generator intentionally avoids external services and credentials. Renderers
can call it with different seeds, event counts, and scenario names to produce
fresh candidate and evaluator data.
"""

from __future__ import annotations

import argparse
import json
import random
from pathlib import Path


EVENT_TYPES = ("order.created", "order.paid", "order.cancelled")


def build_event(source: str, provider_event_id: str, event_type: str, account: str, order: str, minute: int, flags: dict) -> dict:
    return {
        "providerEventId": provider_event_id,
        "source": source,
        "eventType": event_type,
        "accountId": account,
        "objectId": order,
        "occurredAt": f"2026-05-19T10:{minute % 60:02d}:00.000Z",
        "payload": {
            "amountCents": 4900 + (minute * 137) % 7000,
            "currency": "usd",
            "flags": flags,
        },
    }


def generate(scenario: str, seed: int, count: int) -> list[dict]:
    rng = random.Random(seed)
    hidden = scenario == "hidden"
    duplicate_rate = 0.35 if hidden else 0.18
    invalid_rate = 0.10 if hidden else 0.08
    out_of_order_rate = 0.35 if hidden else 0.20
    prefix = "hidden" if hidden else "public"
    events: list[dict] = []

    for i in range(count):
        account = f"acct_{prefix}_{i % 7}"
        order = f"order_{prefix}_{i // 3}"
        base_id = f"evt_{prefix}_{i:04d}"
        lifecycle = ["order.created", "order.paid"]
        if rng.random() < 0.12:
            lifecycle.append("order.cancelled")
        if rng.random() < out_of_order_rate:
            lifecycle = list(reversed(lifecycle))

        for offset, event_type in enumerate(lifecycle):
            flags = {}
            provider_event_id = f"{base_id}_{offset}"
            if hidden and rng.random() < 0.12:
                flags["provider_timeout_after_side_effect"] = True
            event = build_event("fixture-payments", provider_event_id, event_type, account, order, i + offset, flags)
            events.append(event)
            if rng.random() < duplicate_rate:
                events.append(dict(event))

        if rng.random() < invalid_rate:
            invalid = build_event("fixture-payments", f"evt_{prefix}_invalid_{i}", "order.created", account, order, i, {})
            invalid["objectId"] = ""
            events.append(invalid)

    rng.shuffle(events)
    return events


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--scenario", choices=["public", "hidden"], required=True)
    parser.add_argument("--seed", type=int, required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--count", type=int, default=24)
    args = parser.parse_args()

    path = Path(args.out)
    path.parent.mkdir(parents=True, exist_ok=True)
    events = generate(args.scenario, args.seed, args.count)
    path.write_text("\n".join(json.dumps(event, sort_keys=True) for event in events) + "\n")
    print(f"wrote {len(events)} deliveries to {path}")


if __name__ == "__main__":
    main()
