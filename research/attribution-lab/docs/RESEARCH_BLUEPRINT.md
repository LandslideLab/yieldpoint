# Astra — Research Blueprint (v0.1, 2026-09-08)

## Positioning

| | Planeta (Read the Room) | Astra |
|---|---|---|
| Question | Who decides? (authority) | Who gets credit / blame? (attribution) |
| Unit | one human × one AI | one human lead × several specialist AIs |
| IV | handover policy / autonomy level | **authority structure** (decision rule) + team composition |
| DV | performance, trust, capability evolution | **credit/blame shares + gap indices** |
| Method | sandbox experiments (OHC) | consultation simulation → calibrated human vignette experiments |
| Metaphor | a planet around a star | a constellation |

Astra's name is not decorative: Planeta (a single planet) is the dyadic case;
Astra (stars, plural) is the multi-body case. The two papers cite each other:
authority allocation (Planeta) predicts where attribution gaps (Astra) appear.

## Research questions

- **RQ1**: How does the authority structure of a human–multi-AI clinical team
  shape post-hoc credit and blame allocation after correct and wrong outcomes?
- **RQ2**: Do documented attribution biases (moral crumple zone, responsibility
  diffusion, self-serving bias, automation bias) appear *quantitatively* in
  clinical multi-AI teams, and how large are they relative to normative,
  decision-path-based responsibility?
- **RQ3**: Can displaying normative (decision-path) responsibility — "the
  machine's advice drove this decision" — reduce the attribution gap without
  harming perceived accountability? (intervention arm)

## Falsifiable hypotheses (prototype already detects H1–H3)

- **H1 (crumple zone)**: under machine-following rules (AI_ONLY,
  BEST_AI_FOLLOW without veto), human blame share > normative share whenever
  the team follows machine advice into error. → demo: human blame 0.15–0.18
  vs normative 0.00 under AI_ONLY/majority.
- **H2 (diffusion)**: human credit share on success decreases with the number
  of AIs. → demo: 0.50 (n_ai=1) → 0.41 (n_ai=5).
- **H3 (automation penalty)**: confident-but-wrong machine advice that was
  followed adds human blame beyond crumple. → demo: +0.013 mean.
- **H4 (authority asymmetry)**: the gap between biased and normative blame is
  largest exactly where the human had *least* causal control but *most*
  institutional accountability (operator at the end of an AI-driven chain) —
  the measurable moral crumple zone; intervention (RQ3) shrinks it.

## Experiment plan

1. **Simulation stage (this repo, v0.1)**: grid over authority rule × n_ai ×
   case difficulty; outcome & attribution records; indices. Deterministic
   (seeded). ✔ prototype running.
2. **Mechanism stage**: calibration regimes — overconfident AI profiles,
   correlated errors across AIs (echo chamber of models), advice presentation
   order, human skill × AI skill quadrants. Sweep bias parameters to map the
   index surface (sensitivity analysis like DOSE's).
3. **Human stage (vignettes)**: physicians/residents read a consultation
   transcript (who advised what, who decided) and allocate credit/blame.
   Estimate the *actual* bias parameters → recalibrate `biased_attribution`.
   Ethics approval required; target 2×2×2 vignette design.
4. **Intervention stage**: show decision-path responsibility overlay
   ("followed AI-Rad's recommendation") vs control; test RQ3.

## Relationship to sibling projects (no overlap)

- **Planeta / Crusaders / yieldpoint / SlimeMold**: authority & org-structure
  engines and studies. Astra uses decision rules as an *input* and studies
  attribution as an *output*; it builds no authority machinery.
- **DOSE**: exposure allocation of news; Astra is clinical-team attribution.
  Shared DNA: calibrated probabilities, simulation-first, verifiable indices.
- **human-ai-meta / researcher-meta-analysis**: literature-level effects;
  Astra provides one mechanism-level explanation for why HMC outcomes get
  misattributed (relevant to the "combination gain" debate).

## Literature anchors (to be verified one-by-one before any citation — per
Noah's citation-verification rule)

- Elish, M. C. (2019). Moral crumple zones. Engaging STS / SSRN 2757236.
- Causal responsibility attribution for human–AI collaboration (arXiv
  2411.03275) — Shapley/actual-causality limits.
- Responsibility attribution experiments in HMC (consumer/coworker levels;
  e.g. MDPI Behav. Sci. 2026;16(6):985) — team-level clinical gap remains.
- Jussupow et al. on physicians & AI advice (ISR, for anchoring bias terms).
- Human-AI advice-taking under conflicting recommendations (to be collected
  systematically in the mechanism stage).

## Milestones

- [x] v0.1 prototype: sim + attribution models + grid runner + tests
- [ ] mechanism stage sweeps + index surface maps (sensitivity)
- [ ] human vignette protocol + ethics (connects to Planeta's human-study arm)
- [ ] paper draft (target: CSCW/CHI or MISQ/ISR-style venue; check fit later)
