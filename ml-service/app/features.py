"""
SIROI ML Service — Longitudinal Feature Extractor
Processes real-world patient game attempts into tabular vectors matching the trained models.
Strictly checks minimum record count (< 3 returns insufficient data signal).
"""
import math
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional, Tuple
import numpy as np
import pandas as pd

from .schemas import GameAttemptInput, PatientDemographics, FeatureSnapshot

MIN_REQUIRED_ATTEMPTS = 3

class InsufficientDataException(Exception):
    def __init__(self, count: int):
        self.count = count
        super().__init__(
            f"Patient has only {count} session(s). At least {MIN_REQUIRED_ATTEMPTS} completed cognitive "
            "sessions are required to calculate a reliable longitudinal trend."
        )

def _parse_timestamp(ts: Optional[str]) -> datetime:
    if not ts:
        return datetime.now(timezone.utc)
    try:
        # Handle ISO strings with Z or timezone offset
        clean_ts = ts.replace("Z", "+00:00")
        return datetime.fromisoformat(clean_ts)
    except Exception:
        return datetime.now(timezone.utc)

def _normalize_accuracy(val: float) -> float:
    # Ensure accuracy is in [0.0, 1.0]
    if val > 1.0:
        return max(0.0, min(1.0, val / 100.0))
    return max(0.0, min(1.0, val))

def extract_longitudinal_features(
    attempts: List[GameAttemptInput],
    demographics: Optional[PatientDemographics] = None
) -> Tuple[Dict[str, float], FeatureSnapshot]:
    """
    Extracts features required by Model A and Model B.
    Raises InsufficientDataException if len(attempts) < MIN_REQUIRED_ATTEMPTS.
    """
    if not attempts or len(attempts) < MIN_REQUIRED_ATTEMPTS:
        raise InsufficientDataException(len(attempts) if attempts else 0)

    # Sort attempts chronologically
    sorted_attempts = sorted(
        attempts,
        key=lambda a: _parse_timestamp(a.created_at)
    )

    timestamps = [_parse_timestamp(a.created_at) for a in sorted_attempts]
    accuracies = np.array([_normalize_accuracy(a.accuracy) for a in sorted_attempts], dtype=float)
    scores = np.array([float(a.score) for a in sorted_attempts], dtype=float)
    durations = np.array([float(a.duration_seconds or 30.0) for a in sorted_attempts], dtype=float)
    difficulties = np.array([float(a.difficulty_level or 1) for a in sorted_attempts], dtype=float)

    n_total = len(sorted_attempts)
    latest_ts = timestamps[-1]

    # Demographic defaults
    age = float(demographics.age) if demographics and demographics.age else 72.0
    education = float(demographics.education_years) if demographics and demographics.education_years else 14.0

    # Basic stats
    accuracy_mean = float(np.mean(accuracies))
    accuracy_std = float(np.std(accuracies, ddof=1)) if n_total > 1 else 0.05
    score_mean = float(np.mean(scores))
    average_duration = float(np.mean(durations))

    # Last 5 and Last 10
    accuracy_last_5 = float(np.mean(accuracies[-5:]))
    accuracy_last_10 = float(np.mean(accuracies[-10:]))

    # 30-day and 7-day windows based on latest attempt date
    days_from_latest = [(latest_ts - ts).total_seconds() / 86400.0 for ts in timestamps]
    idx_30d = [i for i, d in enumerate(days_from_latest) if d <= 30.0]
    idx_7d = [i for i, d in enumerate(days_from_latest) if d <= 7.0]

    if idx_30d:
        accuracy_30d = float(np.mean(accuracies[idx_30d]))
        # 30d slope: slope over 30 days window
        if len(idx_30d) >= 2:
            x_vals = np.array([days_from_latest[i] for i in idx_30d])
            # x is days ago (positive), reverse so earlier days have smaller x
            x_time = np.max(x_vals) - x_vals
            y_vals = accuracies[idx_30d]
            if np.std(x_time) > 1e-4:
                slope_cov = np.cov(x_time, y_vals)[0, 1]
                slope_var = np.var(x_time, ddof=1)
                accuracy_slope_30d = float(slope_cov / slope_var) if slope_var > 0 else 0.0
            else:
                accuracy_slope_30d = float(y_vals[-1] - y_vals[0])
        else:
            accuracy_slope_30d = 0.0
    else:
        accuracy_30d = accuracy_last_5
        accuracy_slope_30d = 0.0

    accuracy_7d = float(np.mean(accuracies[idx_7d])) if idx_7d else accuracy_last_5

    # Overall score slope across all attempts
    if n_total >= 2:
        x_norm = np.linspace(0, 1, n_total)
        score_cov = np.cov(x_norm, scores)[0, 1]
        score_var = np.var(x_norm, ddof=1)
        score_slope = float(score_cov / score_var) if score_var > 0 else 0.0
    else:
        score_slope = 0.0

    # Duration trend
    if n_total >= 4:
        recent_dur = np.mean(durations[-3:])
        early_dur = np.mean(durations[:3])
        if recent_dur > early_dur * 1.25:
            duration_trend = "increasing"
        elif recent_dur < early_dur * 0.75:
            duration_trend = "decreasing"
        else:
            duration_trend = "stable"
    else:
        duration_trend = "stable"

    # Current difficulty: weighted average of the last 3 sessions
    current_difficulty = float(np.mean(difficulties[-3:]))

    # Games per week
    earliest_ts = timestamps[0]
    span_days = max(1.0, (latest_ts - earliest_ts).total_seconds() / 86400.0)
    games_per_week = float(round((n_total / span_days) * 7.0, 2))
    # Cap between 0.5 and 21.0
    games_per_week = max(0.5, min(21.0, games_per_week))

    # Completion rate: attempts with accuracy > 0.05
    completed_count = sum(1 for acc in accuracies if acc > 0.05)
    completion_rate = float(completed_count / n_total)

    # Dominant category accuracies
    category_accs: Dict[str, List[float]] = {}
    for a in sorted_attempts:
        gt = a.game_type or "memory-match"
        category_accs.setdefault(gt, []).append(_normalize_accuracy(a.accuracy))
    dominant_category_acc = {
        gt: round(float(np.mean(acc_list)), 3) for gt, acc_list in category_accs.items()
    }

    # Model input feature dictionary (exact order matching training feature set)
    feature_vector = {
        "accuracy_mean": accuracy_mean,
        "accuracy_last_5": accuracy_last_5,
        "accuracy_last_10": accuracy_last_10,
        "accuracy_30d": accuracy_30d,
        "accuracy_slope_30d": accuracy_slope_30d,
        "accuracy_std": accuracy_std,
        "score_mean": score_mean,
        "average_duration": average_duration,
        "completion_rate": completion_rate,
        "games_per_week": games_per_week,
        "current_difficulty": current_difficulty,
        "age": age,
        "education_years": education,
    }

    feature_snapshot = FeatureSnapshot(
        totalSessions=n_total,
        accuracyLast5=round(accuracy_last_5, 3),
        accuracyLast10=round(accuracy_last_10, 3),
        accuracy7d=round(accuracy_7d, 3),
        accuracy30d=round(accuracy_30d, 3),
        accuracySlope30d=round(accuracy_slope_30d, 4),
        scoreSlope=round(score_slope, 2),
        accuracyMean=round(accuracy_mean, 3),
        accuracyStd=round(accuracy_std, 3),
        averageDurationSeconds=round(average_duration, 1),
        durationTrend=duration_trend,
        currentDifficulty=round(current_difficulty, 1),
        gamesPerWeek=games_per_week,
        dominantCategoryAccuracy=dominant_category_acc
    )

    return feature_vector, feature_snapshot
