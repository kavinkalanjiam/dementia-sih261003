"""
SIROI ML Service — Database Client
Interacts with Supabase REST API to retrieve patient historical game attempts and persist ML predictions.
Gracefully operates even if Supabase is offline or not configured.
"""
import os
import json
import urllib.request
import urllib.error
from typing import List, Optional, Dict, Any

from .schemas import GameAttemptInput, PatientDemographics, PredictResponse

SUPABASE_URL = os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_ANON_KEY") or os.environ.get("VITE_SUPABASE_ANON_KEY", "")

def is_configured() -> bool:
    return bool(SUPABASE_URL and SUPABASE_KEY and SUPABASE_URL.startswith("http"))

def _headers() -> Dict[str, str]:
    return {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation"
    }

def fetch_patient_attempts_from_db(patient_id: str) -> List[GameAttemptInput]:
    """
    Fetches game_attempts rows for patient_id from Supabase REST API.
    """
    if not is_configured() or not patient_id:
        return []

    url = f"{SUPABASE_URL.rstrip('/')}/rest/v1/game_attempts?patient_id=eq.{patient_id}&order=created_at.asc"
    req = urllib.request.Request(url, headers=_headers(), method="GET")

    try:
        with urllib.request.urlopen(req, timeout=5) as response:
            if response.status == 200:
                data = json.loads(response.read().decode("utf-8"))
                attempts = []
                for row in data:
                    attempts.append(GameAttemptInput(
                        game_type=row.get("game_type", "memory-match"),
                        score=float(row.get("score") or 0.0),
                        accuracy=float(row.get("accuracy") or row.get("score") or 0.0),
                        duration_seconds=float(row.get("duration_seconds") or 30.0),
                        difficulty_level=int(row.get("difficulty_level") or 1),
                        created_at=row.get("created_at"),
                        total_questions=row.get("total_questions"),
                        correct_answers=row.get("correct_answers")
                    ))
                return attempts
    except Exception as e:
        print(f"[ML Database] Supabase fetch game_attempts warning: {e}")
        return []

    return []

def fetch_patient_demographics_from_db(patient_id: str) -> Optional[PatientDemographics]:
    """
    Fetches patient age/education from Supabase patients table if available.
    """
    if not is_configured() or not patient_id:
        return None

    url = f"{SUPABASE_URL.rstrip('/')}/rest/v1/patients?id=eq.{patient_id}&select=age,gender"
    req = urllib.request.Request(url, headers=_headers(), method="GET")

    try:
        with urllib.request.urlopen(req, timeout=5) as response:
            if response.status == 200:
                data = json.loads(response.read().decode("utf-8"))
                if data and len(data) > 0:
                    row = data[0]
                    return PatientDemographics(
                        age=float(row.get("age") or 72.0),
                        gender=row.get("gender"),
                        education_years=14.0
                    )
    except Exception as e:
        print(f"[ML Database] Supabase fetch demographics warning: {e}")

    return None

def save_prediction_to_db(pred: PredictResponse) -> bool:
    """
    Persists prediction record to Supabase ml_predictions table.
    """
    if not is_configured():
        return False

    url = f"{SUPABASE_URL.rstrip('/')}/rest/v1/ml_predictions"
    payload = {
        "id": pred.id,
        "patient_id": pred.patientId,
        "model_version": pred.modelVersion,
        "prediction_type": pred.predictionType,
        "predicted_category": pred.predictedCategory,
        "trajectory": pred.trajectory,
        "prediction_horizon_days": pred.predictionHorizonDays,
        "confidence": pred.confidence,
        "category_probabilities": pred.categoryProbabilities.model_dump(),
        "features_snapshot": pred.featuresSnapshot.model_dump(),
        "explanation": [e.model_dump() for e in pred.explanation],
        "insufficient_data_reason": pred.insufficientDataReason,
        "created_at": pred.createdAt
    }

    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers=_headers(),
        method="POST"
    )

    try:
        with urllib.request.urlopen(req, timeout=5) as response:
            return response.status in (200, 201)
    except Exception as e:
        print(f"[ML Database] Supabase save prediction warning: {e}")
        return False

def fetch_latest_prediction_from_db(patient_id: str) -> Optional[Dict[str, Any]]:
    """
    Fetches the most recent ml_predictions record for a patient.
    """
    if not is_configured() or not patient_id:
        return None

    url = f"{SUPABASE_URL.rstrip('/')}/rest/v1/ml_predictions?patient_id=eq.{patient_id}&order=created_at.desc&limit=1"
    req = urllib.request.Request(url, headers=_headers(), method="GET")

    try:
        with urllib.request.urlopen(req, timeout=5) as response:
            if response.status == 200:
                data = json.loads(response.read().decode("utf-8"))
                if data and len(data) > 0:
                    return data[0]
    except Exception as e:
        print(f"[ML Database] Supabase fetch latest prediction warning: {e}")

    return None
