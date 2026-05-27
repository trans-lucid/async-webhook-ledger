#!/usr/bin/env python3
"""Wait for local simulator services used by the public integration path."""

from __future__ import annotations

import time
import urllib.request


URLS = [
    "http://localhost:4566/_localstack/health",
    "http://localhost:8089/__admin/requests",
]


def wait_for(url: str) -> None:
    last_error: Exception | None = None
    for _ in range(60):
        try:
            with urllib.request.urlopen(url, timeout=2) as response:
                if response.status < 500:
                    return
        except Exception as exc:  # pragma: no cover - diagnostic path
            last_error = exc
        time.sleep(1)
    raise SystemExit(f"service not ready: {url}: {last_error}")


def main() -> None:
    for url in URLS:
        wait_for(url)
    print("local simulator services ready")


if __name__ == "__main__":
    main()
