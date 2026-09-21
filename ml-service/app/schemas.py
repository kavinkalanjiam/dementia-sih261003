"""
SIROI ML Service — Pydantic Schemas for Request and Response Payloads.
Ensures strict type validation, safety guarantees, and non-diagnostic language.
"""
from typing import List, Optional, Dict, Literal
from pydantic import BaseModel, Field
import time
import uuid

class GameAttemptInput(BaseModel):
    game_type: Optional[str] = "memory-match"
    score: float = Field(..., ge=0, description="Session score")
    accuracy: float = Field(..., ge=0.0, le=100.0, description="Accuracy percentage (0-100) or ratio (0.0-1.0)")
    duration_seconds: Optional[float] = Field(default=30.0, ge=0.0)
    difficulty_level: Optional[int] = Field(default=1, ge=1, le=10)
    created_at: Optional[str] = None
    total_questions: Optional[int] = None
    correct_answers: Optional[int] = None

class PatientDemographics(BaseModel):
    age: Optional[float] = Field(default=72.0, ge=40.0, le=110.0)
    education_years: Optional[float] = Field(default=14.0, ge=0.0, le=30.0)
    gender: Optional[str] = None

class PredictRequest(BaseModel):
    patient_id: str
    patient_name: Optional[str] = None
    attempts: Optional[List[GameAttemptInput]] = None
    demographics: Optional[PatientDemographics] = None

class CategoryProbabilities(BaseModel):
    cognitively_unimpaired: float = Field(default=0.0, ge=0.0, le=1.0)
    mild_cognitive_impairment: float = Field(default=0.0, ge=0.0, le=1.0)
    dementia: float = Field(default=0.0, ge=0.0, le=1.0)

class FeatureExplanation(BaseModel):
    featureName: str
    description: str
    impactDirection: Literal["positive", "negative", "neutral"]
    relativeContribution: float = Field(default=0.0, ge=0.0, le=1.0)

class FeatureSnapshot(BaseModel):
    totalSessions: int
    accuracyLast5: Optional[float] = None
    accuracyLast10: Optional[float] = None
    accuracy7d: Optional[float] = None
    accuracy30d: Optional[float] = None
    accuracySlope30d: Optional[float] = None
    scoreSlope: Optional[float] = None
    accuracyMean: Optional[float] = None
    accuracyStd: Optional[float] = None
    averageDurationSeconds: Optional[float] = None
    durationTrend: Optional[str] = None
    currentDifficulty: float = 1.0
    gamesPerWeek: float = 0.0
    dominantCategoryAccuracy: Optional[Dict[str, float]] = None

class PredictResponse(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    patientId: str
    patientName: Optional[str] = None
    modelVersion: str = "siroi-cognitive-v1"
    predictionType: str = "decision_support_research"
    predictedCategory: Literal["cognitively_unimpaired", "mild_cognitive_impairment", "dementia", "insufficient_data"]
    trajectory: Literal["stable", "improving", "declining", "insufficient_data"]
    predictionHorizonDays: int = 180
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    categoryProbabilities: CategoryProbabilities
    featuresSnapshot: FeatureSnapshot
    explanation: List[FeatureExplanation] = Field(default_factory=list)
    insufficientDataReason: Optional[str] = None
    createdAt: str = Field(default_factory=lambda: time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()))
    disclaimer: str = (
        "SIROI Decision-Support Research Estimate: This algorithmic analysis identifies cognitive "
        "activity trends for caregiver decision support. It is NOT a medical diagnosis of dementia "
        "or any neurological condition. Consult a qualified neurologist or physician for clinical evaluations."
    )
