"""
SIROI Cognitive Analysis & Longitudinal Prediction Module
FastAPI application exposing model endpoints for authorized caregiver dashboards.
Strictly non-diagnostic decision-support research design.
"""
import os
import time
from typing import Optional
from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware

from .schemas import (
    PredictRequest,
    PredictResponse,
    CategoryProbabilities,
    FeatureSnapshot,
)
from .features import extract_longitudinal_features, InsufficientDataException
from .predictor import predictor
from .database import (
    fetch_patient_attempts_from_db,
    fetch_patient_demographics_from_db,
    save_prediction_to_db,
    fetch_latest_prediction_from_db
)

app = FastAPI(
    title="SIROI Cognitive Analysis API",
    description="Machine learning longitudinal cognitive analysis and trajectory estimation for SIROI.",
    version="1.0.0"
)

# Enable CORS for frontend applications (Vite dev server, mobile tunnels, production)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health", tags=["Health"])
def health_check():
    return {
        "status": "healthy",
        "service": "siroi-cognitive-analysis",
        "model_version": predictor.metadata.get("model_version", "siroi-cognitive-v1"),
        "features_count": len(predictor.feature_names),
        "disclaimer": predictor.metadata.get("disclaimer", "SIROI decision-support research estimate. Not a medical diagnosis.")
    }

@app.get("/metrics", tags=["Model Quality"])
def get_model_metrics():
    """
    Returns training validation metrics, balanced accuracy, macro-F1, and confusion matrices.
    """
    return predictor.metadata

@app.post("/predict/{patient_id}", response_model=PredictResponse, tags=["Prediction"])
def predict_cognitive_status(patient_id: str, request: Optional[PredictRequest] = None):
    """
    Evaluates historical cognitive/game activity records for patient_id.
    Accepts client-provided sessions (e.g. from local Dexie store) or retrieves them from Supabase.
    Strictly prevents fake predictions when fewer than 3 sessions exist.
    """
    attempts = []
    patient_name = None
    demographics = None

    if request:
        attempts = request.attempts or []
        patient_name = request.patient_name
        demographics = request.demographics

    # Fallback to database if request didn't supply game attempts
    if not attempts:
        attempts = fetch_patient_attempts_from_db(patient_id)

    # Fallback to database for demographics if not provided
    if not demographics:
        demographics = fetch_patient_demographics_from_db(patient_id)

    # Enforce minimum data requirement (< 3 sessions)
    if len(attempts) < 3:
        n_sessions = len(attempts)
        reason = (
            f"Patient currently has {n_sessions} completed cognitive session{'s' if n_sessions != 1 else ''}. "
            "A minimum of 3 sessions is required to extract meaningful longitudinal trends and generate a reliable "
            "decision-support estimate. Please continue participating in daily cognitive activities."
        )
        return PredictResponse(
            patientId=patient_id,
            patientName=patient_name,
            predictedCategory="insufficient_data",
            trajectory="insufficient_data",
            confidence=0.0,
            categoryProbabilities=CategoryProbabilities(
                cognitively_unimpaired=0.0,
                mild_cognitive_impairment=0.0,
                dementia=0.0
            ),
            featuresSnapshot=FeatureSnapshot(
                totalSessions=n_sessions,
                currentDifficulty=1.0,
                gamesPerWeek=0.0
            ),
            explanation=[],
            insufficientDataReason=reason
        )

    try:
        # 1. Longitudinal Feature Extraction
        feature_dict, snapshot = extract_longitudinal_features(attempts, demographics)

        # 2. ML Inference (Model A & Model B) + Clinical Explainability
        pred_category, trajectory, confidence, probabilities, explanations = predictor.predict(feature_dict)

        response = PredictResponse(
            patientId=patient_id,
            patientName=patient_name,
            predictedCategory=pred_category,  # type: ignore
            trajectory=trajectory,            # type: ignore
            confidence=confidence,
            categoryProbabilities=probabilities,
            featuresSnapshot=snapshot,
            explanation=explanations,
            insufficientDataReason=None
        )

        # 3. Persist to database for historical audit & realtime broadcast
        save_prediction_to_db(response)

        return response

    except InsufficientDataException as ide:
        return PredictResponse(
            patientId=patient_id,
            patientName=patient_name,
            predictedCategory="insufficient_data",
            trajectory="insufficient_data",
            confidence=0.0,
            categoryProbabilities=CategoryProbabilities(
                cognitively_unimpaired=0.0,
                mild_cognitive_impairment=0.0,
                dementia=0.0
            ),
            featuresSnapshot=FeatureSnapshot(
                totalSessions=ide.count,
                currentDifficulty=1.0,
                gamesPerWeek=0.0
            ),
            explanation=[],
            insufficientDataReason=str(ide)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Internal cognitive analysis error: {str(e)}"
        )

@app.get("/prediction/{patient_id}", tags=["Prediction"])
def get_latest_prediction(patient_id: str):
    """
    Returns the most recent prediction saved in the database for patient_id.
    """
    record = fetch_latest_prediction_from_db(patient_id)
    if not record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No cognitive analysis record found for patient {patient_id}."
        )
    return record
