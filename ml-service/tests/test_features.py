"""
SIROI ML Service — Feature Extraction Unit Tests
Tests edge cases: < 3 sessions, irregular intervals, single vs multi-game types, accuracy normalization.
"""
import pytest
from datetime import datetime, timedelta, timezone

from app.schemas import GameAttemptInput, PatientDemographics
from app.features import (
    extract_longitudinal_features,
    InsufficientDataException,
    MIN_REQUIRED_ATTEMPTS
)

def _make_attempt(days_ago: float, accuracy: float, score: float = 80.0, game_type: str = "memory-match") -> GameAttemptInput:
    ts = (datetime.now(timezone.utc) - timedelta(days=days_ago)).isoformat()
    return GameAttemptInput(
        game_type=game_type,
        score=score,
        accuracy=accuracy,
        duration_seconds=32.0,
        difficulty_level=2,
        created_at=ts
    )

def test_insufficient_data_zero_attempts():
    with pytest.raises(InsufficientDataException) as exc_info:
        extract_longitudinal_features([])
    assert exc_info.value.count == 0

def test_insufficient_data_one_attempt():
    attempts = [_make_attempt(1.0, 85.0)]
    with pytest.raises(InsufficientDataException) as exc_info:
        extract_longitudinal_features(attempts)
    assert exc_info.value.count == 1

def test_insufficient_data_two_attempts():
    attempts = [_make_attempt(2.0, 80.0), _make_attempt(1.0, 85.0)]
    with pytest.raises(InsufficientDataException) as exc_info:
        extract_longitudinal_features(attempts)
    assert exc_info.value.count == 2

def test_valid_three_attempts_minimum():
    attempts = [
        _make_attempt(5.0, 80.0),
        _make_attempt(3.0, 85.0),
        _make_attempt(1.0, 90.0)
    ]
    features, snapshot = extract_longitudinal_features(attempts)
    assert snapshot.totalSessions == 3
    assert "accuracy_mean" in features
    assert "accuracy_slope_30d" in features
    assert features["accuracy_mean"] == pytest.approx(0.85, abs=0.02)
    assert features["current_difficulty"] == pytest.approx(2.0, abs=0.01)

def test_accuracy_normalization():
    # Mix of 0-100 scale and 0-1 ratio scale
    attempts = [
        _make_attempt(10.0, 90.0),
        _make_attempt(5.0, 0.85),
        _make_attempt(1.0, 95.0)
    ]
    features, snapshot = extract_longitudinal_features(attempts)
    assert 0.0 <= features["accuracy_mean"] <= 1.0
    assert features["accuracy_mean"] == pytest.approx(0.90, abs=0.03)

def test_multi_game_types_and_irregular_intervals():
    attempts = [
        _make_attempt(25.0, 75.0, game_type="memory-match"),
        _make_attempt(22.0, 80.0, game_type="sequence-recall"),
        _make_attempt(14.0, 85.0, game_type="name-face"),
        _make_attempt(7.0, 78.0, game_type="familiar-places"),
        _make_attempt(2.0, 82.0, game_type="number-memory"),
        _make_attempt(0.5, 88.0, game_type="memory-match"),
    ]
    demographics = PatientDemographics(age=76.0, education_years=16.0)
    features, snapshot = extract_longitudinal_features(attempts, demographics)

    assert snapshot.totalSessions == 6
    assert features["age"] == 76.0
    assert features["education_years"] == 16.0
    assert "memory-match" in snapshot.dominantCategoryAccuracy
    assert "sequence-recall" in snapshot.dominantCategoryAccuracy
    assert snapshot.gamesPerWeek > 0.0
