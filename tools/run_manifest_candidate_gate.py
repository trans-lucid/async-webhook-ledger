#!/usr/bin/env python3
"""Run manifest-declared candidate commands and validate expected failures."""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

BAD_FAILURE_MARKERS = [
    "No test files found",
    "no tests ran",
    "collected 0 items",
    "Cannot find module",
    "ModuleNotFoundError",
    "ERR_MODULE_NOT_FOUND",
    "trace_api_not_ready",
    "service_not_ready",
]


def load_manifest() -> dict:
    return json.loads((ROOT / "translucid-template.json").read_text())


def run_command(command: str, cwd: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(command, cwd=cwd, shell=True, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)


def split_commands(manifest: dict, mode: str) -> tuple[list[str], str, list[str]]:
    commands = list(manifest[f"candidate_{mode}_commands"])
    expected = manifest.get("candidate_expected_failure_commands", {}).get(mode)
    if not expected:
        raise SystemExit(f"manifest missing candidate_expected_failure_commands.{mode}")
    if expected not in commands:
        raise SystemExit(f"expected failure command {expected!r} is not listed in candidate_{mode}_commands")
    cleanup = [command for command in commands[commands.index(expected) + 1 :] if "clean" in command]
    return commands, expected, cleanup


def validate_failure(output: str, markers: list[str]) -> None:
    for bad in BAD_FAILURE_MARKERS:
        if bad.lower() in output.lower():
            raise AssertionError(f"candidate failed for infrastructure reason: {bad}")
    if not any(marker in output for marker in markers):
        raise AssertionError("candidate failed, but not for a declared expected marker")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=["public", "docker"])
    parser.add_argument("--candidate-dir", default="candidate")
    args = parser.parse_args()

    manifest = load_manifest()
    candidate_dir = (ROOT / args.candidate_dir).resolve()
    commands, expected_failure, cleanup_commands = split_commands(manifest, args.mode)
    markers = list(manifest.get("expected_failure_markers") or [])
    if not markers:
        raise SystemExit("manifest missing expected_failure_markers")

    saw_expected_failure = False
    try:
        for command in commands:
            if command in cleanup_commands:
                continue
            print(f"$ {command}", flush=True)
            result = run_command(command, candidate_dir)
            print(result.stdout, end="")
            if command == expected_failure:
                saw_expected_failure = True
                if result.returncode == 0:
                    raise AssertionError(f"candidate unexpectedly passed expected-failure command: {command}")
                validate_failure(result.stdout, markers)
                print(f"candidate failed for declared expected marker during {args.mode} validation")
                continue
            if result.returncode != 0:
                raise AssertionError(f"candidate setup command failed before expected marker: {command}")
    finally:
        for command in cleanup_commands:
            print(f"$ {command}", flush=True)
            result = run_command(command, candidate_dir)
            print(result.stdout, end="")

    if not saw_expected_failure:
        raise AssertionError(f"expected failure command was not run for {args.mode}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except AssertionError as exc:
        print(str(exc), file=sys.stderr)
        raise SystemExit(1)
