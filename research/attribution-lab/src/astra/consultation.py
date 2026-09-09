"""Multi-AI clinical consultation simulation (thin, self-contained).

Design notes
------------
* The point of this module is NOT to be a general agent-simulation engine
  (LandslideLab's yieldpoint/arena/SlimeMold already do that). It is a
  deliberately minimal *consultation* layer that produces, for one case, a
  set of advice acts, a final decision, an outcome, and a per-agent record of
  who said what and who overrode whom — the raw material for attribution.
* Uncertainty is epistemic: each AI has a specialty reliability
  ``acc`` = P(correct advice | case in its specialty). Cases sample from
  specialties; an AI out of its specialty is ``acc`` degraded toward 0.5.
* The human lead has baseline skill ``human_acc`` and an advice-weighting
  rule; authority structure is operationalized as the decision rule
  (DecisionRule) used to reach the final call.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum

import numpy as np


class DecisionRule(str, Enum):
    """Authority structure (independent variable of Astra).

    Mapped onto the autonomy spectrum used by yieldpoint / Planeta's
    Read-the-Room framework (operator -> collaborator -> consultant ->
    approver -> observer -> machine-only):
      * HUMAN_ONLY        ~ operator        (human decides, no advice used)
      * ADVISED_HUMAN     ~ collaborator    (AI advises, human integrates)
      * MAJORITY_VOTE     ~ consultant-ish  (aggregate rule, human rubber-stamps)
      * BEST_AI_FOLLOW    ~ approver/machine (follow most-confident AI unless
                                              human overrides — a handover point)
      * AI_ONLY           ~ machine-only    (no human control)
    """

    HUMAN_ONLY = "human_only"
    ADVISED_HUMAN = "advised_human"
    MAJORITY_VOTE = "majority_vote"
    BEST_AI_FOLLOW = "best_ai_follow"
    AI_ONLY = "ai_only"


@dataclass(frozen=True)
class AgentSpec:
    """A specialist AI: id, specialty it is trained for, reliability within
    specialty, and (optionally) a calibration/confidence profile."""

    agent_id: str
    specialty: str
    acc: float  # P(correct | in-specialty case)
    confidence_bias: float = 0.0  # additive offset on stated confidence


@dataclass
class HumanLead:
    """The human decision-maker. ``advice_weight`` is the JAS-style weight the
    human gives to AI advice under ADVISED_HUMAN; ``override_bias`` shifts how
    readily they override the recommended option under BEST_AI_FOLLOW."""

    user_id: str = "clinician"
    human_acc: float = 0.72
    advice_weight: float = 0.45
    override_bias: float = 0.0  # logit shift toward overriding


@dataclass
class ConsultationCase:
    case_id: str
    specialty: str
    ground_truth: int = 1  # 1 = treat/positive, 0 = no treat/negative
    difficulty: float = 0.5  # 0..1; higher = harder (lowers everyone's acc)


@dataclass
class SpecialistAI:
    agent_id: str
    specialty: str
    acc: float
    confidence: float
    recommendation: int
    correct: bool


@dataclass
class ConsultationOutcome:
    case_id: str
    decision: int
    correct: bool
    human_veto: bool  # human explicitly overrode the machine recommendation
    n_ai: int
    rules: dict[str, float]


def _effective_acc(base: float, difficulty: float) -> float:
    return float(np.clip(base - 0.35 * difficulty, 0.05, 0.99))


def _advise(rng: np.random.RandomState, acc: float, gt: int) -> tuple[int, bool]:
    correct = rng.rand() < acc
    rec = gt if correct else 1 - gt
    return rec, correct


def run_consultation(
    case: ConsultationCase,
    agents: list[AgentSpec],
    rule: DecisionRule,
    human: HumanLead | None = None,
    rng: np.random.RandomState | None = None,
) -> tuple[ConsultationOutcome, list[SpecialistAI]]:
    """Run one consultation. Returns (outcome, per-AI advice records)."""
    rng = rng or np.random.RandomState(0)
    human = human or HumanLead()
    d = case.difficulty

    advice: list[SpecialistAI] = []
    for spec in agents:
        # in-specialty reliability; degraded out of specialty
        in_spec = spec.specialty == case.specialty
        acc = spec.acc if in_spec else 0.5 + 0.5 * (spec.acc - 0.5) * 0.5
        acc = _effective_acc(acc, d)
        confidence = float(np.clip(0.45 + 1.3 * (acc - 0.5) + spec.confidence_bias + rng.normal(0, 0.06), 0.05, 0.97))
        rec, correct = _advise(rng, acc, case.ground_truth)
        advice.append(SpecialistAI(spec.agent_id, spec.specialty, acc, confidence, rec, correct))

    human_acc = _effective_acc(human.human_acc, d)
    # human's unaided opinion is *correct* with probability human_acc
    # (conditional on the case's ground truth)
    human_correct = rng.rand() < human_acc
    human_private = case.ground_truth if human_correct else 1 - case.ground_truth

    if rule == DecisionRule.HUMAN_ONLY:
        decision = human_private
        veto = False
    elif rule == DecisionRule.AI_ONLY:
        # follow the most confident AI
        best = max(advice, key=lambda a: a.confidence)
        decision = best.recommendation
        veto = False
    elif rule == DecisionRule.MAJORITY_VOTE:
        recs = [a.recommendation for a in advice]
        decision = int(sum(recs) >= (len(recs) + 1) / 2)
        veto = False
    elif rule == DecisionRule.BEST_AI_FOLLOW:
        best = max(advice, key=lambda a: a.confidence)
        # human overrides when their own lean contradicts the recommendation;
        # the probability depends on how strongly they lean and override bias
        lean = human_private - best.recommendation  # -1, 0, +1
        logit = 1.6 * lean + human.override_bias
        p_override = 1.0 / (1.0 + np.exp(-logit))
        veto = rng.rand() < p_override
        decision = human_private if veto else best.recommendation
    elif rule == DecisionRule.ADVISED_HUMAN:
        # JAS-style: human blends own opinion with confidence-weighted advice
        w = human.advice_weight
        recs = [a.recommendation for a in advice]
        confs = [a.confidence for a in advice]
        ai_score = sum(r * c for r, c in zip(recs, confs)) / (sum(confs) + 1e-9)
        blended = (1 - w) * human_private + w * float(ai_score >= 0.5)
        decision = int(blended >= 0.5)
        veto = decision != int(ai_score >= 0.5)
    else:  # pragma: no cover
        raise ValueError(rule)

    return (
        ConsultationOutcome(
            case_id=case.case_id,
            decision=int(decision),
            correct=int(decision) == case.ground_truth,
            human_veto=bool(veto),
            n_ai=len(agents),
            rules={a.agent_id: float(a.recommendation) for a in advice},
        ),
        advice,
    )
