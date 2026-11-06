"""CLI: python -m digilog.generate --preset medium --output synthetic.json"""
import argparse
import json
from pathlib import Path
from .schemas import PRESETS
from .engine import Twin

def main():
    p = argparse.ArgumentParser(description="Generate a fictional logistics dataset and simulation events")
    p.add_argument("--preset", choices=list(PRESETS), default="medium")
    p.add_argument("--output", type=Path, required=True)
    args = p.parse_args()
    twin = Twin(PRESETS[args.preset])
    twin.advance(twin.config.duration)
    args.output.write_text(json.dumps(twin.snapshot(), indent=2))
    print(f"Synthetic dataset written to {args.output}")

if __name__ == "__main__":
    main()
