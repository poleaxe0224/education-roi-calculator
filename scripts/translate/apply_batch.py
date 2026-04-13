"""Apply a batch of zh-TW translations to profile-text-zh-TW.json.

Usage:
    python scripts/translate/apply_batch.py <batch_file.json>

Batch file format:
    {
      "SOC-CODE": {
        "what_they_do": "...",
        "work_environment": "...",
        "how_to_become": {
          "education": "...",
          "experience": "...",
          "training": "..."
        }
      },
      ...
    }

Only the fields present in the batch file are overwritten. Missing fields
are preserved (so partial batches work).
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TARGET = ROOT / "src" / "data" / "profile-text-zh-TW.json"


def main(batch_path: str) -> None:
    batch = json.loads(Path(batch_path).read_text(encoding="utf-8"))
    data = json.loads(TARGET.read_text(encoding="utf-8"))

    applied = []
    for soc, fields in batch.items():
        if soc not in data:
            print(f"WARN: {soc} not found in target, skipping")
            continue
        entry = data[soc]
        for k, v in fields.items():
            if k == "how_to_become":
                entry.setdefault("how_to_become", {}).update(v)
            else:
                entry[k] = v
        applied.append(soc)

    TARGET.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"Applied {len(applied)} profiles: {applied}")


if __name__ == "__main__":
    main(sys.argv[1])
