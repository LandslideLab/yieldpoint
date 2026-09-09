# Attribution Lab 🌌

**Attribution in human–multi-AI clinical teams: how authority structure
shapes credit and blame.**

> 归档注记(2026-09-09):本目录收编自 2026-09-08 的独立原型仓库
> `NoahIsARider/Astra`(已删除)。代号 **Astra 停用**,留给 Noah 未来另一个
> 项目;代码内部的历史命名(`src/astra`、docstring 等)原样保留。研究方向
> 不变:归因层,不造引擎。

Planeta studies *who decides* — dynamic authority handover between one human
and one AI. This lab studies *who gets the credit and who carries the blame*
when a clinical team of **one human lead + several specialist AIs** reaches an
outcome. Planets orbit a single star; constellations are many bodies at once.

> 一句话:Planeta 管「谁拍板」,Attribution Lab 管「出了事功劳/责任落在谁」。

## Why here (research/attribution-lab inside yieldpoint)

- **Different dependent-variable cluster**: authority transfer (yieldpoint,
  Planeta, Crusaders, SlimeMold) vs **attribution** — credit, blame,
  responsibility gaps.
- **Different object level**: dyad (human × AI) → **multi-body team**
  (human × several specialist AIs).
- **Engine layer already exists**: yieldpoint/arena/SlimeMold cover
  authority/autonomy simulation; this lab deliberately does **not** build
  another engine. It adds the *attribution layer* + falsifiable predictions,
  and can later run *on top of* those engines as carriers.
- Literature anchor: responsibility attribution in HMC is an active area
  (moral crumple zone — Elish 2019; causal-responsibility frameworks — e.g.
  arXiv:2411.03275), but **measurable experiments on clinical multi-AI teams
  linking authority structure → credit/blame** are missing.

## Core idea

The **authority structure** (who can veto/decide) is the independent variable.
The dependent variables are the gaps between

- **normative attribution** — responsibility given the *actual decision path*
  (if the team followed a machine into error, the machine's advice is causally
  responsible; if the human vetoed into error, the human is), and
- **biased attribution** — what observers/teams actually do:
  - **moral crumple zone**: humans absorb blame for machine-followed errors,
  - **responsibility diffusion**: human credit dilutes as AI count grows,
  - **self-serving bias**: claim credit on success, deflect blame on failure,
  - **automation bias**: confident-but-wrong machine advice adds human blame
    ("you should have overridden it").

## Quickstart

```bash
python3 -m pip install -e .[dev]
PYTHONPATH=src python3 -m pytest -q
PYTHONPATH=src python3 run_experiment.py --cases 500 --seed 42
# -> artifacts/experiment_results.json + reports/experiment_summary.md
```

## Current demo results (seed 42, 16 000 consultations)

| authority rule | accuracy | human blame (biased) | human blame (normative) |
|---|---|---|---|
| human_only | 0.596 | 0.919 | 1.000 |
| advised_human | 0.588 | 0.662 | 0.673 |
| best_ai_follow | 0.576 | 0.536 | 0.497 |
| ai_only | 0.591 | 0.147 | 0.000 |
| majority_vote | 0.507 | 0.178 | 0.000 |

Mean gap indices: **crumple +0.059, diffusion +0.088, automation penalty +0.013**
(all > 0 — the three hypotheses H1–H3 in `docs/RESEARCH_BLUEPRINT.md` are
already detectable in the prototype). Team-size effect: human credit falls
0.50 → 0.41 as n_ai goes 1 → 5.

## Repository map

```
src/astra/
  consultation.py   thin multi-AI clinical consultation sim (decision rules =
                    authority structures; calibrated specialist AIs)
  attribution.py    normative (decision-path) + biased (crumple/diffusion/
                    self-serving/automation) credit & blame models
  metrics.py        experiment grid runner + summaries
run_experiment.py   CLI: full grid -> JSON + markdown
docs/RESEARCH_BLUEPRINT.md  research questions, hypotheses, experiment plan
```

## Status

Prototype (v0.1): deterministic, tested (6 tests), all three gap indices
nonzero. Next: calibration regimes (overconfident AIs, correlated errors),
calibrating bias parameters with human-subject vignette data, and riding
yieldpoint/SlimeMold as the authority engine.
