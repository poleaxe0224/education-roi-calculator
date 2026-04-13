"""
Fix WOF-corrupted files written by Node.js on this Windows system.

On this machine, Node.js writeFileSync produces files with a 0x887d
header that other programs (Python, esbuild, .NET) can't read back.
Workaround: read the file via Node (which CAN read its own output),
then rewrite via Python (which produces normal files).

Usage:
    python scripts/fix-wof.py                      # default: src/data/*.json
    python scripts/fix-wof.py <path> [<path>...]   # explicit files or dirs
    python scripts/fix-wof.py --glob "dist/share/*.html" "dist/sw.js"

Directories are walked recursively; every file is checked for the WOF
magic bytes and rewritten only if corrupted.
"""

import argparse
import json
import subprocess
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent
DEFAULT_DATA_DIR = PROJECT_ROOT / "src" / "data"

WOF_MAGIC = b"\x88\x7d"

DEFAULT_DATA_FILES = [
    "wages.json",
    "cps_earnings.json",
    "onet-data.json",
    "tuition.json",
    "ipeds.json",
]


def is_wof_compressed(filepath: Path) -> bool:
    with open(filepath, "rb") as f:
        return f.read(2) == WOF_MAGIC


def read_via_node(filepath: Path) -> str:
    result = subprocess.run(
        ["node", "-e", f"process.stdout.write(require('fs').readFileSync('{filepath.as_posix()}', 'utf-8'))"],
        capture_output=True,
        shell=True,
    )
    if result.returncode != 0:
        raise RuntimeError(f"Node.js read failed: {result.stderr.decode('utf-8', errors='replace')}")
    return result.stdout.decode("utf-8")


def fix_file(filepath: Path) -> bool:
    """Rewrite a WOF-corrupted file via Python. Returns True if fixed."""
    if not is_wof_compressed(filepath):
        return False

    content = read_via_node(filepath)

    # If it parses as JSON, re-serialize (preserves indentation for JSON outputs).
    # Otherwise, write the raw text as-is.
    if filepath.suffix == ".json":
        try:
            data = json.loads(content)
            with open(filepath, "w", encoding="utf-8", newline="\n") as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
                f.write("\n")
            return True
        except json.JSONDecodeError:
            pass  # Fall through to raw write

    with open(filepath, "w", encoding="utf-8", newline="\n") as f:
        f.write(content)
    return True


def iter_targets(paths: list[Path]):
    """Yield every file under the given paths (recursively for directories)."""
    for p in paths:
        p = p.resolve()
        if not p.exists():
            print(f"  SKIP {p} (not found)")
            continue
        if p.is_file():
            yield p
        elif p.is_dir():
            for child in p.rglob("*"):
                if child.is_file():
                    yield child


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "paths",
        nargs="*",
        help="Files or directories to scan. Defaults to src/data/ when omitted.",
    )
    args = parser.parse_args()

    if args.paths:
        targets = [Path(p) for p in args.paths]
    else:
        targets = [DEFAULT_DATA_DIR / name for name in DEFAULT_DATA_FILES]

    def short(p: Path) -> str:
        try:
            return str(p.relative_to(PROJECT_ROOT.resolve()))
        except ValueError:
            return str(p)

    fixed = 0
    checked = 0
    for filepath in iter_targets(targets):
        checked += 1
        try:
            if fix_file(filepath):
                print(f"  FIX  {short(filepath)}")
                fixed += 1
        except Exception as e:
            print(f"  FAIL {short(filepath)}: {e}")
            sys.exit(1)

    print(f"\nChecked {checked} file(s), fixed {fixed}.")


if __name__ == "__main__":
    main()
