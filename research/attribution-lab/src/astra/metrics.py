"""Experiment runner: authority structure x team composition x outcome.

The core Astra experiment: fix a case distribution, vary the *authority
structure* (DecisionRule) and team composition (number of specialist AIs,
reliability), then measure how biased attribution responds — holding the
normative, decision-path-based responsibility fixed.

Falsifiable predictions Astra is built to test (see docs/RESEARCH_BLUEPRINT.md):

  H1 (crumple zone): human blame share under machine-following rules exceeds
      the normative share whenever the team follows machine advice into error
      (positive crumple index), and grows with team reliance on machines.
  H2 (diffusion): human credit share under success falls as the number of AIs
      grows (credit is diluted across the constellation).
  H3 (automation penalty): confident-but-wrong machine advice adds human blame
      beyond the crumple baseline ("you should have overridden it").
"""

from __future__ import annotations

from dataclasses import dataclass, field
from statistics import mean

import numpy as np

from .attribution import (
    AttributionGapReport,
    biased_attribution,
    normative_attribution,
)
from .consultation import (
    AgentSpec,
    ConsultationCase,
    DecisionRule,
    HumanLead,
    run_consultation,
)

HUMAN_ID = "clinician"
SPECIALTIES = ["radiology", "cardiology", "pathology", "dermatology", "neurology"]


@dataclass
class TeamSpec:
    n_ai: int = 3
    ai_acc: float = 0.85
    human_acc: float = 0.72


def make_agents(team: TeamSpec, seed: int = 0) -> list[AgentSpec]:
    rng = np.random.RandomState(seed)
    agents = []
    for i in range(team.n_ai):
        spec = SPECIALTIES[i % len(SPECIALTIES)]
        acc = float(np.clip(team.ai_acc + rng.normal(0, 0.03), 0.55, 0.98))
        agents.append(
            AgentSpec(
                agent_id=f"ai_{spec[:4]}_{i}",
                specialty=spec,
                acc=acc,
                confidence_bias=float(rng.normal(0, 0.02)),
            )
        )
    return agents


def run_case(
    case: ConsultationCase,
    team: TeamSpec,
    rule: DecisionRule,
    human: HumanLead,
    rng: np.random.RandomState,
) -> dict:
    """Run one consultation + both attribution models. Returns a flat record."""
    agents = make_agents(team, seed=abs(hash(case.case_id + rule.value)) % (2**31))
    outcome, advice = run_consultation(case, agents, rule, human, rng)
    norm = normative_attribution(outcome, advice, rule)
    biased = biased_attribution(outcome, advice, rule)
    return {
        "case": case.case_id,
        "rule": rule.value,
        "n_ai": len(agents),
        "correct": bool(outcome.correct),
        "veto": bool(outcome.human_veto),
        "norm_blame_h": norm[HUMAN_ID],
        "norm_credit_h": norm[HUMAN_ID] if outcome.correct else 0.0,
        "blame_h": biased.blame[HUMAN_ID],
        "credit_h": biased.credit[HUMAN_ID],
        "crumple": biased.crumple_index,
        "diffusion": biased.diffusion_index,
        "auto_penalty": biased.auto_penalty,
    }


def experiment(
    n_cases: int = 500,
    rules: list[DecisionRule] | None = None,
    team_sizes: list[int] | None = None,
    seed: int = 42,
) -> list[dict]:
    """Grid: every rule x every team size x n_cases, stratified by specialty."""
    rules = rules or [
        DecisionRule.HUMAN_ONLY,
        DecisionRule.ADVISED_HUMAN,
        DecisionRule.MAJORITY_VOTE,
        DecisionRule.BEST_AI_FOLLOW,
        DecisionRule.AI_ONLY,
    ]
    team_sizes = team_sizes or [1, 2, 3, 5]
    rng = np.random.RandomState(seed)
    human = HumanLead()
    rows: list[dict] = []
    for n_ai in team_sizes:
        team = TeamSpec(n_ai=n_ai)
        for rule in rules:
            for i in range(n_cases):
                spec = SPECIALTIES[i % len(SPECIALTIES)]
                gt = int(rng.rand() < 0.5)
                case = ConsultationCase(
                    case_id=f"c{i:04d}",
                    specialty=spec,
                    ground_truth=gt,
                    difficulty=float(rng.uniform(0.15, 0.6)),
                )
                rows.append(run_case(case, team, rule, human, rng))
    return rows


def summarize_experiment(rows: list[dict]) -> AttributionGapReport:
    rep = AttributionGapReport(n=len(rows))
    by_rule: dict[str, list[dict]] = {}
    for r in rows:
        by_rule.setdefault(r["rule"], []).append(r)
    for rule, rs in by_rule.items():
        rep.human_blame_by_rule[rule] = mean(x["blame_h"] for x in rs)
        rep.human_credit_by_rule[rule] = mean(x["credit_h"] for x in rs)
        rep.human_blame_norm_by_rule[rule] = mean(x["norm_blame_h"] for x in rs)
        rep.accuracy_by_rule[rule] = mean(1.0 if x["correct"] else 0.0 for x in rs)
    rep.mean_crumple = mean(x["crumple"] for x in rows)
    rep.mean_diffusion = mean(x["diffusion"] for x in rows)
    rep.mean_auto_penalty = mean(x["auto_penalty"] for x in rows)
    return rep


def markdown_summary(rep: AttributionGapReport, rows: list[dict]) -> str:
    lines = [
        "# Astra experiment summary",
        "",
        f"- cases: {rep.n}",
        f"- mean crumple index (human blame − normative blame): **{rep.mean_crumple:+.4f}**",
        f"- mean diffusion index (human credit lost to team size): **{rep.mean_diffusion:+.4f}**",
        f"- mean automation-override penalty: **{rep.mean_auto_penalty:+.4f}**",
        "",
        "## By authority rule",
        "",
        "| rule | accuracy | human blame (biased) | human blame (norm) | human credit |",
        "|---|---|---|---|---|",
    ]
    for rule in rep.human_blame_by_rule:
        lines.append(
            f"| {rule} | {rep.accuracy_by_rule[rule]:.4f} | "
            f"{rep.human_blame_by_rule[rule]:.4f} | {rep.human_blame_norm_by_rule[rule]:.4f} | "
            f"{rep.human_credit_by_rule[rule]:.4f} |"
        )
    lines.append("")
    by_n: dict[int, list[dict]] = {}
    for r in rows:
        by_n.setdefault(r["n_ai"], []).append(r)
    lines.append("## By team size (all rules)")
    lines.append("")
    lines.append("| n_ai | accuracy | human blame | human credit | crumple |")
    lines.append("|---|---|---|---|---|")
    for n in sorted(by_n):
        rs = by_n[n]
        lines.append(
            f"| {n} | {mean(1.0 if x['correct'] else 0.0 for x in rs):.4f} | "
            f"{mean(x['blame_h'] for x in rs):.4f} | {mean(x['credit_h'] for x in rs):.4f} | "
            f"{mean(x['crumple'] for x in rs):+.4f} |"
        )
    lines.append("")
    lines.append("_Generated by astra.metrics.summarize_experiment_")
    return "\n".join(lines)
