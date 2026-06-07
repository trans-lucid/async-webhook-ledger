#!/usr/bin/env python3
"""Validate generated branches from published-style repository roots."""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GENERATED = ROOT / "generated"


def run(command: list[str] | str, cwd: Path, *, env: dict[str, str] | None = None) -> subprocess.CompletedProcess[str]:
    printable = command if isinstance(command, str) else " ".join(command)
    print(f"$ {printable}", flush=True)
    result = subprocess.run(
        command,
        cwd=cwd,
        shell=isinstance(command, str),
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        env=env,
    )
    print(result.stdout, end="")
    return result


def must_pass(command: list[str] | str, cwd: Path) -> None:
    result = run(command, cwd)
    if result.returncode != 0:
        raise AssertionError(f"command failed: {command}")
    lowered = result.stdout.lower()
    if "no test files found" in lowered or "collected 0 items" in lowered or "no tests ran" in lowered:
        raise AssertionError(f"command did not discover tests: {command}")


def load_manifest() -> dict:
    return json.loads((ROOT / "translucid-template.json").read_text())


def copy_branch(source: Path, target: Path) -> None:
    if target.exists():
        shutil.rmtree(target)
    shutil.copytree(source, target, ignore=shutil.ignore_patterns("node_modules", "__pycache__", "*.pyc", ".pytest_cache", "*.egg-info", ".DS_Store"))


def run_solution_docker_commands(solution_dir: Path, manifest: dict) -> None:
    commands = list(manifest.get("candidate_docker_commands") or [])
    cleanup = [command for command in commands if "clean" in command]
    try:
        for command in commands:
            if command in cleanup:
                continue
            must_pass(command, solution_dir)
    finally:
        for command in cleanup:
            run(command, solution_dir)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--skip-docker", action="store_true")
    args = parser.parse_args()

    manifest = load_manifest()
    slug = manifest.get("template_slug", ROOT.name)

    must_pass([sys.executable, "tools/render_template.py"], ROOT)

    with tempfile.TemporaryDirectory(prefix=f"translucid-{slug}-") as tmp:
        temp_root = Path(tmp)
        candidate_dir = temp_root / f"translucid-{slug}-candidate"
        solution_dir = temp_root / f"translucid-{slug}-solution"
        copy_branch(GENERATED / "main", candidate_dir)
        copy_branch(GENERATED / "solution", solution_dir)

        must_pass(
            [
                sys.executable,
                "tools/check_published_repo_contract.py",
                "--candidate-dir",
                str(candidate_dir),
                "--solution-dir",
                str(solution_dir),
                "--manifest",
                "translucid-template.json",
            ],
            ROOT,
        )

        must_pass([sys.executable, "tools/run_manifest_candidate_gate.py", "public", "--candidate-dir", str(candidate_dir)], ROOT)
        if not args.skip_docker:
            must_pass([sys.executable, "tools/run_manifest_candidate_gate.py", "docker", "--candidate-dir", str(candidate_dir)], ROOT)

        must_pass(["bash", "evaluator/run_public.sh"], solution_dir)
        must_pass(["bash", "evaluator/run_hidden.sh"], solution_dir)
        if not args.skip_docker:
            run_solution_docker_commands(solution_dir, manifest)

    print("published-root validation passed")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except AssertionError as exc:
        print(str(exc), file=sys.stderr)
        raise SystemExit(1)
