"""
SIROI ML Service — FastAPI Endpoint Integration Tests
Tests /health, /metrics, /predict/{patient_id} with sufficient and insufficient sessions.
"""
import pytest
from datetime import datetime, timedelta, timezone
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

def _make_attempt(days_ago: float, accuracy: float):
    ts = (datetime.now(timezone.utc) - timedelta(days=days_ago)).isoformat()
    return {
        "game_type": "memory-match",
        "score": 85.0,
        "accuracy": accuracy,
        "duration_seconds": 28.0,
        "difficulty_level": 2,
        "created_at": ts
    }

def test_health_endpoint():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["service"] == "siroi-cognitive-analysis"
    assert "Not a medical diagnosis" in data["disclaimer"]

def test_metrics_endpoint():
    response = client.get("/metrics")
    assert response.status_code == 200
    data = response.json()
    assert "category_model" in data["metrics"]
    assert "trajectory_model" in data["metrics"]
    assert data["metrics"]["category_model"]["balanced_accuracy"] > 0.80

def test_predict_insufficient_data():
    payload = {
        "patient_id": "test-patient-uuid-1",
        "patient_name": "Test Patient",
        "attempts": [
            _make_attempt(1.0, 90.0)
        ]
    }
    response = client.post("/predict/test-patient-uuid-1", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["predictedCategory"] == "insufficient_data"
    assert data["trajectory"] == "insufficient_data"
    assert "minimum of 3 sessions" in data["insufficientDataReason"].lower()
    assert data["confidence"] == 0.0

def test_predict_sufficient_data_healthy():
    payload = {
        "patient_id": "test-patient-uuid-2",
        "patient_name": "Test Healthy",
        "attempts": [
            _make_attempt(10.0, 92.0),
            _make_attempt(7.0, 90.0),
            _make_attempt(4.0, 94.0),
            _make_attempt(1.0, 95.0)
        ],
        "demographics": {
            "age": 68.0,
            "education_years": 16.0
        }
    }
    response = client.post("/predict/test-patient-uuid-2", json=payload)
    assert response.status_code == 200
    data = response.json()

    assert data["predictedCategory"] in ["cognitively_unimpaired", "mild_cognitive_impairment", "dementia"]
    assert data["trajectory"] in ["stable", "improving", "declining"]
    assert data["predictionHorizonDays"] == 180
    assert 0.0 <= data["confidence"] <= 1.0

    probs = data["categoryProbabilities"]
    prob_sum = probs["cognitively_unimpaired"] + probs["mild_cognitive_impairment"] + probs["dementia"]
    assert pytest.approx(prob_sum, abs=0.05) == 1.0

    assert len(data["explanation"]) > 0
    assert "not a medical diagnosis" in data["disclaimer"].lower()
