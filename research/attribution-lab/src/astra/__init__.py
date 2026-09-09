"""Astra — attribution in human–multi-AI clinical teams.

Planeta asks *who decides* (authority handover); Astra asks *who gets the credit
and who carries the blame* when a clinical team of one human lead and several
specialist AIs reaches an outcome.

This package provides:
- `consultation`: a thin, self-contained multi-AI clinical consultation
  simulation (specialist AIs give calibrated advice; the human lead arbitrates
  under a configurable decision rule = the "authority structure").
- `attribution`: normative (decision-path-based) and cognitive-biased
  (moral-crumple-zone, responsibility-diffusion, self-serving, automation-bias)
  credit/blame models, plus the gaps between them.
- `metrics`: experiment runner over authority structure x team composition x
  outcome, aggregating attribution-gap indices.

Engine-layer note: Astra deliberately does NOT build another multi-agent
simulation engine. The authority/autonomy machinery already exists in
LandslideLab (yieldpoint: dynamic power handover; SlimeMold: org-design ABM;
arena: scenario evaluation). Astra's contribution is the *attribution layer*
and falsifiable predictions about how authority structure shapes credit and
blame — see docs/RESEARCH_BLUEPRINT.md.
"""

from .attribution import (
    AttributionGapReport,
    BiasedAttribution,
    biased_attribution,
    normative_attribution,
)
from .consultation import (
    AgentSpec,
    ConsultationCase,
    ConsultationOutcome,
    DecisionRule,
    HumanLead,
    SpecialistAI,
    run_consultation,
)
from .metrics import TeamSpec, experiment, markdown_summary, run_case, summarize_experiment

__all__ = [
    "AgentSpec",
    "ConsultationCase",
    "ConsultationOutcome",
    "DecisionRule",
    "HumanLead",
    "SpecialistAI",
    "run_consultation",
    "BiasedAttribution",
    "normative_attribution",
    "biased_attribution",
    "AttributionGapReport",
    "TeamSpec",
    "run_case",
    "experiment",
    "summarize_experiment",
    "markdown_summary",
]
