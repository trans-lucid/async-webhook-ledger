#!/usr/bin/env python3
"""Lightweight safety checks for template previews.

This is not a replacement for gitleaks/trufflehog in production, but it catches
candidate-branch leakage and obvious token patterns in local development.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MAIN = ROOT / "generated" / "main"
SECRET_PATTERNS = [
  re.compile(r"ghp_[A-Za-z0-9_]{20,}"),
  re.compile(r"github_pat_[A-Za-z0-9_]{20,}"),
  re.compile(r"sk-[A-Za-z0-9]{20,}"),
  re.compile(r"AKIA[0-9A-Z]{16}"),
  re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
]
FORBIDDEN_MAIN_PARTS = {
  "tests_hidden",
  "fixtures_hidden",
  "SOLUTION.md",
  "SOLUTION.md.j2",
  "rubric.md",
  "expected",
  "evaluator",
  "solution",
}


def fail(message: str) -> None:
  print(f"safety scan failed: {message}", file=sys.stderr)
  sys.exit(1)


def main() -> None:
  if not MAIN.exists():
    fail("generated/main does not exist; run npm run render first")

  for path in MAIN.rglob("*"):
    relative_parts = set(path.relative_to(MAIN).parts)
    if relative_parts & FORBIDDEN_MAIN_PARTS:
      fail(f"candidate main leaked private material at {path.relative_to(MAIN)}")
    if path.is_file() and path.stat().st_size < 2_000_000:
      text = path.read_text(errors="ignore")
      for pattern in SECRET_PATTERNS:
        if pattern.search(text):
          fail(f"possible secret in {path.relative_to(ROOT)}")

  print("safety scan passed")


if __name__ == "__main__":
  main()
