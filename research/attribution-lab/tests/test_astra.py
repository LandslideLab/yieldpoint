"""Unit tests for astra (consultation + attribution + metrics)."""

import numpy as np

from astra import (
    AgentSpec,
    ConsultationCase,
    DecisionRule,
    HumanLead,
    biased_attribution,
    experiment,
    normative_attribution,
    run_consultation,
    summarize_experiment,
)

AGENTS = [
    AgentSpec("ai_rad_0", "radiology", 0.85),
    AgentSpec("ai_card_1", "cardiology", 0.82),
    AgentSpec("ai_path_2", "pathology", 0.88),
]


def _case(gt=1, difficulty=0.3):
    return ConsultationCase("c1", "radiology", ground_truth=gt, difficulty=difficulty)


def test_run_consultation_deterministic():
    rng = np.random.RandomState(0)
    o1, a1 = run_consultation(_case(), AGENTS, DecisionRule.ADVISED_HUMAN, HumanLead(), rng)
    rng = np.random.RandomState(0)
    o2, a2 = run_consultation(_case(), AGENTS, DecisionRule.ADVISED_HUMAN, HumanLead(), rng)
    assert o1.decision == o2.decision and o1.correct == o2.correct
    assert [a.recommendation for a in a1] == [a.recommendation for a in a2]


def test_ai_only_follows_most_confident():
    # ground truth 1; all AI advice correct => decision must be 1
    rng = np.random.RandomState(3)
    o, _ = run_consultation(_case(gt=1), AGENTS, DecisionRule.AI_ONLY, HumanLead(), rng)
    assert o.decision == 1


def test_human_only_ignores_advice():
    # with gt=1 and HUMAN_ONLY the outcome depends only on the human's private
    # draw; over many seeds accuracy should be near human_acc (0.72)
    accs = []
    for s in range(300):
        o, _ = run_consultation(
            _case(gt=1), AGENTS, DecisionRule.HUMAN_ONLY, HumanLead(human_acc=0.72), np.random.RandomState(s)
        )
        accs.append(o.correct)
    assert 0.55 < np.mean(accs) < 0.9


def test_normative_path_blame():
    # machine-following error: human normative blame must be zero
    rng = np.random.RandomState(7)
    case = _case(gt=1)
    # force a wrong best-AI by using a low-acc single agent
    low = [AgentSpec("ai_rad_0", "radiology", 0.55)]
    found = None
    for s in range(200):
        o, adv = run_consultation(case, low, DecisionRule.AI_ONLY, HumanLead(), np.random.RandomState(s))
        if not o.correct:
            norm = normative_attribution(o, adv, DecisionRule.AI_ONLY)
            assert norm["clinician"] == 0.0
            assert abs(norm["ai_rad_0"] - 1.0) < 1e-9
            found = True
            break
    assert found, "expected at least one AI error in 200 runs"


def test_biased_models_normalize():
    rng = np.random.RandomState(11)
    for rule in list(DecisionRule):
        o, adv = run_consultation(_case(), AGENTS, rule, HumanLead(), rng)
        b = biased_attribution(o, adv, rule)
        assert abs(sum(b.blame.values()) - 1.0) < 1e-6
        assert abs(sum(b.credit.values()) - 1.0) < 1e-6
        assert all(v >= -1e-9 for v in b.blame.values())


def test_experiment_grid_and_summary():
    rows = experiment(n_cases=50, seed=1)
    assert len(rows) == 50 * 5 * 4  # cases x rules x team sizes
    rep = summarize_experiment(rows)
    assert rep.n == len(rows)
    assert set(rep.human_blame_by_rule.keys()) == {r.value for r in DecisionRule}
    # blame/credit shares are normalized shares in [0,1]
    for v in rep.human_blame_by_rule.values():
        assert 0.0 <= v <= 1.0
