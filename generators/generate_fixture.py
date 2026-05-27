#!/usr/bin/env python3
"""Generate deterministic webhook fixture streams for the template."""

from __future__ import annotations

import argparse
import json
import random
from pathlib import Path

EVENT_TYPES = ("order.created", "order.paid", "order.cancelled")
COUNT_BY_ENTITY = {"low": 8, "medium": 24, "high": 42}


def load_profile(path: str | None) -> dict:
    if not path:
        return {}
    profile_path = Path(path)
    if not profile_path.exists():
        return {}
    return json.loads(profile_path.read_text())


def profile_settings(profile: dict, scenario: str, seed: int, count: int) -> tuple[int, int, float, float, float, float]:
    hidden = scenario == "hidden"
    if not profile:
        duplicate_rate = 0.35 if hidden else 0.18
        invalid_rate = 0.10 if hidden else 0.08
        out_of_order_rate = 0.35 if hidden else 0.20
        timeout_rate = 0.12 if hidden else 0.0
        return seed, count, duplicate_rate, invalid_rate, out_of_order_rate, timeout_rate

    scenario_profile = profile.get("scenario_profile") if isinstance(profile.get("scenario_profile"), dict) else {}
    difficulty = str(profile.get("difficulty") or profile.get("difficulty_profile") or "senior").lower()
    entity_count = scenario_profile.get("entity_count", "medium")
    failure_modes = scenario_profile.get("failure_modes", "multi_step")
    if profile:
        seed = int(profile.get("generator_seed") or seed)
        count = COUNT_BY_ENTITY.get(str(entity_count), count)
    duplicate_rate = 0.16
    invalid_rate = 0.04
    out_of_order_rate = 0.08
    timeout_rate = 0.0
    if difficulty == "junior":
        duplicate_rate, invalid_rate, out_of_order_rate = 0.12, 0.02, 0.04
    elif difficulty == "staff":
        duplicate_rate, invalid_rate, out_of_order_rate, timeout_rate = 0.42, 0.12, 0.45, 0.18
    else:
        duplicate_rate, invalid_rate, out_of_order_rate, timeout_rate = 0.22, 0.08, 0.22, 0.08
    if hidden:
        duplicate_rate += 0.12
        invalid_rate += 0.04
        out_of_order_rate += 0.12
    if failure_modes == "basic":
        invalid_rate = min(invalid_rate, 0.03)
        out_of_order_rate = min(out_of_order_rate, 0.08)
        timeout_rate = 0.0
    elif failure_modes == "ambiguous":
        timeout_rate = max(timeout_rate, 0.14)
        out_of_order_rate = max(out_of_order_rate, 0.35)
    return seed, count, duplicate_rate, invalid_rate, out_of_order_rate, timeout_rate


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


def generate(scenario: str, seed: int, count: int, profile: dict | None = None) -> list[dict]:
    profile = profile or {}
    seed, count, duplicate_rate, invalid_rate, out_of_order_rate, timeout_rate = profile_settings(profile, scenario, seed, count)
    rng = random.Random(seed)
    hidden = scenario == "hidden"
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
            if timeout_rate > 0 and rng.random() < timeout_rate:
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
    parser.add_argument("--scenario", choices=["public", "hidden"], default="public")
    parser.add_argument("--seed", type=int, default=20260519)
    parser.add_argument("--out", required=True)
    parser.add_argument("--count", type=int, default=24)
    parser.add_argument("--profile")
    args = parser.parse_args()

    profile = load_profile(args.profile)
    path = Path(args.out)
    path.parent.mkdir(parents=True, exist_ok=True)
    events = generate(args.scenario, args.seed, args.count, profile)
    path.write_text("\n".join(json.dumps(event, sort_keys=True) for event in events) + "\n")
    print(f"wrote {len(events)} deliveries to {path}")


if __name__ == "__main__":
    main()
