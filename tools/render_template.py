#!/usr/bin/env python3
"""Render a local preview of generated candidate and private solution material."""

from __future__ import annotations

import shutil
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
GENERATED = ROOT / "generated"
MAIN = GENERATED / "main"
SOLUTION = GENERATED / "solution"


def copytree(src: Path, dst: Path) -> None:
  if dst.exists():
    shutil.rmtree(dst)
  shutil.copytree(src, dst, ignore=shutil.ignore_patterns("node_modules", "results"))


def main() -> None:
  if GENERATED.exists():
    shutil.rmtree(GENERATED)
  GENERATED.mkdir()

  copytree(ROOT / "candidate", MAIN)
  (MAIN / "README.md").write_text((ROOT / "README.md.j2").read_text())
  (MAIN / "DEBRIEF.md").write_text((ROOT / "DEBRIEF.md.j2").read_text())

  copytree(ROOT / "candidate", SOLUTION)
  shutil.copytree(ROOT / "solution", SOLUTION / "solution", ignore=shutil.ignore_patterns("node_modules"))
  shutil.copytree(ROOT / "evaluator", SOLUTION / "evaluator")

  print(f"rendered candidate main preview: {MAIN}")
  print(f"rendered private solution preview: {SOLUTION}")


if __name__ == "__main__":
  main()
