from __future__ import annotations

from collections import defaultdict
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from math import exp
from statistics import mean
from typing import Dict, List, Literal, Optional


ErrorType = Literal["conceptual", "careless", "time_pressure"]
MomentumState = Literal["inactive", "recovery", "acceleration", "plateau", "regression"]


def parse_ts(ts: str) -> datetime:
    # Accepts ISO timestamps such as 2026-03-01T09:30:00Z
    if ts.endswith("Z"):
        ts = ts[:-1] + "+00:00"
    dt = datetime.fromisoformat(ts)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


@dataclass
class LearningEvent:
    student_id: str
    timestamp: str
    platform: str
    question_id: str
    topic_id: str
    subtopic_id: Optional[str]
    difficulty: float
    attempt_no: int
    is_correct: bool
    score: float
    response_time_sec: float
    hint_used: bool
    solution_viewed: bool
    confidence_self_reported: Optional[float] = None
    session_id: Optional[str] = None

    def ts(self) -> datetime:
        return parse_ts(self.timestamp)


@dataclass
class TopicState:
    topic_id: str
    mastery: float
    confidence: float
    forgetting_risk: float
    conceptual_rate: float
    careless_rate: float
    time_pressure_rate: float
    last_seen: Optional[str]
    attempts: int
    correct: int
    trend_slope: float


@dataclass
class StudentState:
    student_id: str
    generated_at: str
    momentum_state: MomentumState
    topic_states: Dict[str, TopicState]


@dataclass
class Recommendation:
    topic_id: str
    priority_score: float
    expected_gain: float
    why: str
    action_plan: List[str]


class LearningStateEngine:
    """
    Hybrid MVP:
    - Topic mastery update via EWMA-style updates
    - Inactivity-aware forgetting risk
    - Error classification: conceptual/careless/time-pressure
    - Momentum detector for learning trajectory
    """

    def __init__(
        self,
        forgetting_half_life_days: float = 14.0,
        base_learning_rate: float = 0.18,
    ) -> None:
        self.forgetting_half_life_days = forgetting_half_life_days
        self.base_learning_rate = base_learning_rate

    def build_state(
        self, student_id: str, events: List[LearningEvent], now: Optional[datetime] = None
    ) -> StudentState:
        if not events:
            return StudentState(
                student_id=student_id,
                generated_at=datetime.now(timezone.utc).isoformat(),
                momentum_state="inactive",
                topic_states={},
            )

        now = now or datetime.now(timezone.utc)
        events = sorted(events, key=lambda e: e.ts())

        topic_mastery: Dict[str, float] = defaultdict(lambda: 0.5)
        topic_correct: Dict[str, int] = defaultdict(int)
        topic_attempts: Dict[str, int] = defaultdict(int)
        topic_last_seen: Dict[str, datetime] = {}
        topic_error_counts: Dict[str, Dict[ErrorType, int]] = defaultdict(
            lambda: {"conceptual": 0, "careless": 0, "time_pressure": 0}
        )
        topic_outcome_window: Dict[str, List[float]] = defaultdict(list)
        topic_time_window: Dict[str, List[float]] = defaultdict(list)

        for ev in events:
            topic = ev.topic_id
            topic_attempts[topic] += 1
            topic_correct[topic] += 1 if ev.is_correct else 0
            topic_last_seen[topic] = ev.ts()

            prev_mastery = topic_mastery[topic]
            lr = self.base_learning_rate * (1.0 + 0.25 * (ev.difficulty - 0.5))
            lr = max(0.05, min(0.3, lr))
            target = 1.0 if ev.is_correct else 0.0
            topic_mastery[topic] = prev_mastery + lr * (target - prev_mastery)

            if not ev.is_correct:
                err = self.classify_error(ev, prev_mastery, topic_time_window[topic])
                topic_error_counts[topic][err] += 1

            topic_outcome_window[topic].append(1.0 if ev.is_correct else 0.0)
            topic_time_window[topic].append(ev.response_time_sec)

        topic_states: Dict[str, TopicState] = {}
        for topic in topic_attempts:
            attempts = topic_attempts[topic]
            correct = topic_correct[topic]
            mastery = topic_mastery[topic]
            last_seen = topic_last_seen.get(topic)

            gap_days = (now - last_seen).total_seconds() / 86400.0 if last_seen else 999.0
            forgetting_risk = 1.0 - self.retention_probability(gap_days, mastery)

            errs = topic_error_counts[topic]
            miss_total = max(1, errs["conceptual"] + errs["careless"] + errs["time_pressure"])
            conceptual_rate = errs["conceptual"] / miss_total
            careless_rate = errs["careless"] / miss_total
            time_pressure_rate = errs["time_pressure"] / miss_total

            slope = self.binary_trend_slope(topic_outcome_window[topic], window=12)

            # Confidence is calibrated by sample size and volatility.
            confidence = min(1.0, attempts / 15.0) * (1.0 - min(0.4, abs(slope)))
            confidence = max(0.05, confidence)

            topic_states[topic] = TopicState(
                topic_id=topic,
                mastery=round(mastery, 4),
                confidence=round(confidence, 4),
                forgetting_risk=round(forgetting_risk, 4),
                conceptual_rate=round(conceptual_rate, 4),
                careless_rate=round(careless_rate, 4),
                time_pressure_rate=round(time_pressure_rate, 4),
                last_seen=last_seen.isoformat() if last_seen else None,
                attempts=attempts,
                correct=correct,
                trend_slope=round(slope, 4),
            )

        momentum_state = self.detect_momentum(events, now)
        return StudentState(
            student_id=student_id,
            generated_at=now.isoformat(),
            momentum_state=momentum_state,
            topic_states=topic_states,
        )

    def recommend(
        self,
        state: StudentState,
        available_minutes: int,
        exam_weights: Optional[Dict[str, float]] = None,
        top_k: int = 3,
    ) -> List[Recommendation]:
        exam_weights = exam_weights or {}
        rows: List[Recommendation] = []

        for topic_id, topic in state.topic_states.items():
            weight = exam_weights.get(topic_id, 1.0)
            confidence_penalty = 1.0 + (1.0 - topic.confidence) * 0.6
            score = weight * (1.0 - topic.mastery) * topic.forgetting_risk * confidence_penalty
            expected_gain = min(0.25, 0.08 + 0.45 * (1.0 - topic.mastery) * (1.0 - topic.confidence))
            dominant_reason = self.dominant_error_reason(topic)

            why = (
                f"mastery={topic.mastery:.2f}, forgetting_risk={topic.forgetting_risk:.2f}, "
                f"trend={topic.trend_slope:+.2f}, dominant_issue={dominant_reason}"
            )
            action_plan = self.topic_action_plan(topic, available_minutes)
            rows.append(
                Recommendation(
                    topic_id=topic_id,
                    priority_score=round(score, 4),
                    expected_gain=round(expected_gain, 4),
                    why=why,
                    action_plan=action_plan,
                )
            )

        rows.sort(key=lambda r: r.priority_score, reverse=True)
        return rows[:top_k]

    def classify_error(
        self, event: LearningEvent, prev_mastery: float, prior_times: List[float]
    ) -> ErrorType:
        median_time = mean(prior_times[-5:]) if prior_times else event.response_time_sec
        if event.response_time_sec < 0.65 * median_time and prev_mastery >= 0.65:
            return "careless"
        if event.response_time_sec > 1.45 * median_time and event.hint_used:
            return "time_pressure"
        return "conceptual"

    def retention_probability(self, gap_days: float, mastery: float) -> float:
        half_life = self.forgetting_half_life_days * (0.6 + 0.8 * mastery)
        lam = 0.69314718056 / max(1e-6, half_life)
        retention = exp(-lam * max(0.0, gap_days))
        return max(0.0, min(1.0, retention))

    def binary_trend_slope(self, outcomes: List[float], window: int = 12) -> float:
        data = outcomes[-window:]
        n = len(data)
        if n < 3:
            return 0.0
        xs = list(range(n))
        x_bar = sum(xs) / n
        y_bar = sum(data) / n
        numer = sum((x - x_bar) * (y - y_bar) for x, y in zip(xs, data))
        denom = sum((x - x_bar) ** 2 for x in xs) or 1.0
        return numer / denom

    def detect_momentum(self, events: List[LearningEvent], now: datetime) -> MomentumState:
        if not events:
            return "inactive"
        last_ts = events[-1].ts()
        days_since_last = (now - last_ts).total_seconds() / 86400.0
        if days_since_last > 21:
            return "inactive"

        recent = events[-20:]
        outcomes = [1.0 if e.is_correct else 0.0 for e in recent]
        slope = self.binary_trend_slope(outcomes, window=min(12, len(outcomes)))
        volume = len([e for e in recent if (now - e.ts()).total_seconds() <= 14 * 86400])

        if slope > 0.06 and volume >= 8:
            return "acceleration"
        if slope > 0.02:
            return "recovery"
        if slope < -0.04:
            return "regression"
        return "plateau"

    def dominant_error_reason(self, topic: TopicState) -> str:
        rates = {
            "conceptual": topic.conceptual_rate,
            "careless": topic.careless_rate,
            "time_pressure": topic.time_pressure_rate,
        }
        return max(rates, key=rates.get)

    def topic_action_plan(self, topic: TopicState, available_minutes: int) -> List[str]:
        block = max(10, min(25, available_minutes // 2))
        plan = []
        dominant = self.dominant_error_reason(topic)
        if dominant == "conceptual":
            plan.append(f"{block} min concept refresh on weakest subtopic.")
            plan.append("Solve 6 medium questions; explain each step out loud.")
        elif dominant == "careless":
            plan.append(f"{block} min accuracy drill with strict checking checklist.")
            plan.append("Solve 8 short questions; verify units/signs before submit.")
        else:
            plan.append(f"{block} min timed set (2 rounds x 6 questions).")
            plan.append("After each round, review bottlenecks and shortcut patterns.")
        plan.append("End with 3 mixed recall questions from prior topics.")
        return plan


def to_jsonable_state(state: StudentState) -> dict:
    payload = asdict(state)
    payload["topic_states"] = {
        k: asdict(v) for k, v in state.topic_states.items()
    }
    return payload


def to_jsonable_recs(recs: List[Recommendation]) -> List[dict]:
    return [asdict(r) for r in recs]


def demo() -> None:
    events = [
        LearningEvent(
            student_id="s-001",
            timestamp="2026-02-10T09:00:00Z",
            platform="MOOC",
            question_id="q1",
            topic_id="algebra",
            subtopic_id="linear_equations",
            difficulty=0.4,
            attempt_no=1,
            is_correct=False,
            score=0.0,
            response_time_sec=92,
            hint_used=True,
            solution_viewed=False,
        ),
        LearningEvent(
            student_id="s-001",
            timestamp="2026-02-12T09:00:00Z",
            platform="MOOC",
            question_id="q2",
            topic_id="algebra",
            subtopic_id="linear_equations",
            difficulty=0.5,
            attempt_no=1,
            is_correct=True,
            score=1.0,
            response_time_sec=65,
            hint_used=False,
            solution_viewed=False,
        ),
        LearningEvent(
            student_id="s-001",
            timestamp="2026-02-13T09:00:00Z",
            platform="Quiz",
            question_id="q3",
            topic_id="calculus",
            subtopic_id="integration",
            difficulty=0.7,
            attempt_no=1,
            is_correct=False,
            score=0.0,
            response_time_sec=155,
            hint_used=True,
            solution_viewed=True,
        ),
        LearningEvent(
            student_id="s-001",
            timestamp="2026-02-14T09:00:00Z",
            platform="Quiz",
            question_id="q4",
            topic_id="calculus",
            subtopic_id="integration",
            difficulty=0.7,
            attempt_no=1,
            is_correct=False,
            score=0.0,
            response_time_sec=170,
            hint_used=True,
            solution_viewed=False,
        ),
        LearningEvent(
            student_id="s-001",
            timestamp="2026-02-16T09:00:00Z",
            platform="Blackboard",
            question_id="q5",
            topic_id="statistics",
            subtopic_id="probability",
            difficulty=0.6,
            attempt_no=1,
            is_correct=True,
            score=1.0,
            response_time_sec=80,
            hint_used=False,
            solution_viewed=False,
        ),
    ]

    engine = LearningStateEngine()
    now = parse_ts("2026-03-01T00:00:00Z")
    state = engine.build_state("s-001", events, now=now)
    recs = engine.recommend(
        state,
        available_minutes=30,
        exam_weights={"calculus": 1.3, "algebra": 1.1, "statistics": 1.0},
    )

    print("=== Student State ===")
    print(to_jsonable_state(state))
    print("\n=== Recommendations ===")
    for row in to_jsonable_recs(recs):
        print(row)


if __name__ == "__main__":
    demo()
