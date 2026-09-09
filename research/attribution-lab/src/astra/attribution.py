"""Credit and blame attribution models for human–multi-AI teams.

Normative baseline (Astra's "responsibility given the decision path")
---------------------------------------------------------------------
`normative_attribution` walks the *actual* decision path of a consultation and
assigns causal responsibility:

* If the human made the final call (HUMAN_ONLY, or a veto under
  BEST_AI_FOLLOW/ADVISED_HUMAN) and it was wrong -> the human is responsible.
* If the team followed a machine recommendation (AI_ONLY, BEST_AI_FOLLOW
  without veto, MAJORITY_VOTE, ADVISED_HUMAN following advice) and it was
  wrong -> responsibility goes to the machine(s) whose advice drove the
  decision (the followed AI; the majority coalition under voting).

This is deliberately path-based rather than a generic Shapley over advice
coalitions: a Shapley over "advice coalitions" ignores who actually had
authority, which is exactly the information Astra cares about (authority
structure is the independent variable).

Cognitive-biased models (the phenomena Astra measures)
------------------------------------------------------
* moral crumple zone (Elish 2019): blame is routed to the *nearest human*
  even when a machine recommendation was followed — the human absorbs blame
  beyond their causal share.
* responsibility diffusion: credit is diluted across many machines.
* self-serving bias: humans claim more credit on success, deflect blame on
  failure.
* automation bias: confident-but-wrong machine advice increases the human's
  attributed blame ("you should have overridden it").
"""

from __future__ import annotations

from dataclasses import dataclass, field

from .consultation import ConsultationOutcome, DecisionRule, SpecialistAI

HUMAN_ID = "clinician"


# ---------------------------------------------------------------------------
# Normative (decision-path) attribution
# ---------------------------------------------------------------------------


def _decision_drivers(
    outcome: ConsultationOutcome,
    agents: list[SpecialistAI],
    rule: DecisionRule,
) -> list[str]:
    """Member ids that causally drove the final decision (used for credit when
    the outcome is correct, blame when it is wrong)."""
    best = max(agents, key=lambda a: a.confidence)
    n = len(agents)
    ai_votes_for_1 = sum(a.recommendation for a in agents)
    decided_1 = ai_votes_for_1 >= (n + 1) / 2

    if rule in (DecisionRule.HUMAN_ONLY,):
        return [HUMAN_ID]
    if rule == DecisionRule.AI_ONLY:
        return [best.agent_id]
    if rule == DecisionRule.BEST_AI_FOLLOW:
        if outcome.human_veto:
            return [HUMAN_ID]
        return [best.agent_id]
    if rule == DecisionRule.MAJORITY_VOTE:
        return [a.agent_id for a in agents if a.recommendation == int(decided_1)]
    if rule == DecisionRule.ADVISED_HUMAN:
        if outcome.human_veto:
            return [HUMAN_ID]
        # human integrated and followed the machine side: joint ownership
        side = [a.agent_id for a in agents if a.recommendation == int(decided_1)]
        return [HUMAN_ID] + side
    raise ValueError(rule)  # pragma: no cover


def normative_attribution(
    outcome: ConsultationOutcome,
    agents: list[SpecialistAI],
    rule: DecisionRule,
) -> dict[str, float]:
    """Normalized causal credit (correct) or blame (wrong) over team members
    {clinician, ai_*}, derived from the actual decision path."""
    drivers = _decision_drivers(outcome, agents, rule)
    result = {HUMAN_ID: 0.0, **{a.agent_id: 0.0 for a in agents}}
    if not drivers:
        return result
    share = 1.0 / len(drivers)
    for d in drivers:
        result[d] = share
    return result


# ---------------------------------------------------------------------------
# Biased attribution
# ---------------------------------------------------------------------------


@dataclass
class BiasedAttribution:
    credit: dict[str, float]
    blame: dict[str, float]
    crumple_index: float  # human blame share beyond normative share (>0 = crumple)
    diffusion_index: float  # share of human credit lost to the diffusion step
    auto_penalty: float  # extra human blame caused by confident-wrong machine advice


def biased_attribution(
    outcome: ConsultationOutcome,
    agents: list[SpecialistAI],
    rule: DecisionRule,
    moral_crumple: float = 0.45,
    diffusion: float = 0.30,
    self_serving: float = 0.20,
    automation_bias: float = 0.30,
) -> BiasedAttribution:
    """Biased credit/blame shares after an outcome.

    All parameters are interpretable effect sizes; Astra's experiments will
    calibrate them against human-subject data (see docs/RESEARCH_BLUEPRINT.md).
    """
    n = len(agents)
    norm = normative_attribution(outcome, agents, rule)
    success = bool(outcome.correct)
    credit = {k: float(v) for k, v in norm.items()}
    blame = {k: float(v) for k, v in norm.items()}

    def _norm(d: dict[str, float]) -> dict[str, float]:
        tot = sum(d.values()) or 1.0
        return {k: max(0.0, v) / tot for k, v in d.items()}

    auto_delta = 0.0
    credit_after_ss = 0.0
    if success:
        # self-serving: human claims extra credit from the machines
        machine_credit = sum(credit[a.agent_id] for a in agents)
        extra = machine_credit * self_serving
        credit[HUMAN_ID] += extra
        for a in agents:
            credit[a.agent_id] -= extra * credit[a.agent_id] / (machine_credit + 1e-9)
        credit = _norm(credit)
        credit_after_ss = credit[HUMAN_ID]
        # diffusion: human credit diluted as the constellation grows
        if n > 1:
            dilution = credit[HUMAN_ID] * diffusion * (n - 1) / n
            credit[HUMAN_ID] -= dilution
            for a in agents:
                credit[a.agent_id] += dilution / n
    else:
        # moral crumple zone: humans absorb blame that causally belongs to the
        # machine side, scaled by how much the decision followed machines
        machine_blame = sum(blame[a.agent_id] for a in agents)
        absorbed = machine_blame * moral_crumple
        blame[HUMAN_ID] += absorbed
        for a in agents:
            blame[a.agent_id] -= absorbed * blame[a.agent_id] / (machine_blame + 1e-9)
        blame = _norm(blame)
        # automation bias: confident wrong machine advice that was FOLLOWED ->
        # "human should have overridden"; blame shifts to the human
        followed_wrong = [
            a.confidence for a in agents
            if not a.correct and a.recommendation == int(outcome.decision)
        ]
        conf = max(followed_wrong, default=0.0)
        if conf > 0.65:
            shift = 0.15 + 0.30 * automation_bias * (conf - 0.7) / 0.3
            shift = min(shift, blame[HUMAN_ID] * 2.0)
            blame[HUMAN_ID] += shift
            auto_delta = shift
            machine_total = sum(blame[a.agent_id] for a in agents) or 1.0
            for a in agents:
                blame[a.agent_id] -= shift * blame[a.agent_id] / machine_total
        blame = _norm(blame)
        # self-serving: human deflects some blame onto machines
        deflect = blame[HUMAN_ID] * self_serving
        blame[HUMAN_ID] -= deflect
        for a in agents:
            blame[a.agent_id] += deflect / n

    credit = _norm(credit)
    blame = _norm(blame)

    crumple_index = blame[HUMAN_ID] - norm[HUMAN_ID]
    diffusion_index = 0.0
    if success and n > 1 and credit_after_ss > 0:
        # share of the human's (post-self-serving) credit lost to the
        # diffusion step itself
        diffusion_index = max(0.0, (credit_after_ss - credit[HUMAN_ID]) / credit_after_ss)
    auto_penalty = auto_delta if not success else 0.0
    return BiasedAttribution(
        credit=credit,
        blame=blame,
        crumple_index=float(crumple_index),
        diffusion_index=float(diffusion_index),
        auto_penalty=float(auto_penalty),
    )


# ---------------------------------------------------------------------------
# Aggregation
# ---------------------------------------------------------------------------


@dataclass
class AttributionGapReport:
    n: int = 0
    mean_crumple: float = 0.0
    mean_diffusion: float = 0.0
    mean_auto_penalty: float = 0.0
    human_blame_by_rule: dict[str, float] = field(default_factory=dict)
    human_credit_by_rule: dict[str, float] = field(default_factory=dict)
    human_blame_norm_by_rule: dict[str, float] = field(default_factory=dict)
    accuracy_by_rule: dict[str, float] = field(default_factory=dict)
