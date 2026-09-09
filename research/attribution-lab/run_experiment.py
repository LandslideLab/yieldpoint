"""Attribution-lab experiment runner (archived from the Astra prototype).

Usage:
    PYTHONPATH=src python3 run_experiment.py --cases 500 --seed 42 \
        --out artifacts/experiment_results.json
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from astra import experiment, markdown_summary, summarize_experiment


def main() -> None:
    parser = argparse.ArgumentParser(description="Astra attribution experiment")
    parser.add_argument("--cases", type=int, default=500)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--out", type=str, default="artifacts/experiment_results.json")
    parser.add_argument("--report", type=str, default="reports/experiment_summary.md")
    args = parser.parse_args()

    rows = experiment(n_cases=args.cases, seed=args.seed)
    rep = summarize_experiment(rows)

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "meta": {"n_cases": args.cases, "seed": args.seed, "n_rows": len(rows)},
        "summary": {
            "mean_crumple": rep.mean_crumple,
            "mean_diffusion": rep.mean_diffusion,
            "mean_auto_penalty": rep.mean_auto_penalty,
            "human_blame_by_rule": rep.human_blame_by_rule,
            "human_credit_by_rule": rep.human_credit_by_rule,
            "human_blame_norm_by_rule": rep.human_blame_norm_by_rule,
            "accuracy_by_rule": rep.accuracy_by_rule,
        },
        "rows": rows,
    }
    out.write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")

    report = Path(args.report)
    report.parent.mkdir(parents=True, exist_ok=True)
    report.write_text(markdown_summary(rep, rows), encoding="utf-8")

    print(f"[done] {len(rows)} rows -> {out}")
    print(markdown_summary(rep, rows))


if __name__ == "__main__":
    main()
