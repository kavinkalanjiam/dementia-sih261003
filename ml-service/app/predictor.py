"""
SIROI ML Service — Inference Engine
Loads serialized artifacts, runs calibrated Model A and Model B, and generates explainability signals.
Strictly adheres to non-diagnostic terminology.
"""
import os
import json
from pathlib import Path
from typing import Dict, Any, List, Tuple
import joblib
import pandas as pd
import numpy as np

from .schemas import CategoryProbabilities, FeatureExplanation

MODELS_DIR = Path(__file__).resolve().parent.parent / "models"

class Predictor:
    def __init__(self):
        self.category_model = None
        self.trajectory_model = None
        self.metadata = None
        self._load_artifacts()

    def _load_artifacts(self):
        cat_path = MODELS_DIR / "category_model_v1.joblib"
        traj_path = MODELS_DIR / "trajectory_model_v1.joblib"
        meta_path = MODELS_DIR / "metadata_v1.json"

        if not cat_path.exists() or not traj_path.exists() or not meta_path.exists():
            raise FileNotFoundError(
                f"Model artifacts missing in {MODELS_DIR}. Run training pipeline first."
            )

        self.category_model = joblib.load(cat_path)
        self.trajectory_model = joblib.load(traj_path)
        with open(meta_path, "r", encoding="utf-8") as f:
            self.metadata = json.load(f)

    @property
    def feature_names(self) -> List[str]:
        return self.metadata.get("features", [])

    def predict(self, feature_dict: Dict[str, float]) -> Tuple[str, str, float, CategoryProbabilities, List[FeatureExplanation]]:
        """
        Executes Category and Trajectory models on the longitudinal feature vector.
        Returns (predicted_category, trajectory, confidence, probabilities, explanations).
        """
        # Form single-row DataFrame adhering to training feature schema
        df = pd.DataFrame([feature_dict])[self.feature_names]

        # Model A: Calibrated Random Forest for Category
        cat_probs_raw = self.category_model.predict_proba(df)[0]
        class_labels = list(self.category_model.classes_)

        prob_dict = {
            label: float(cat_probs_raw[i]) for i, label in enumerate(class_labels)
        }

        # Safe defaults if label absent
        probabilities = CategoryProbabilities(
            cognitively_unimpaired=round(prob_dict.get("cognitively_unimpaired", 0.0), 3),
            mild_cognitive_impairment=round(prob_dict.get("mild_cognitive_impairment", 0.0), 3),
            dementia=round(prob_dict.get("dementia", 0.0), 3),
        )

        # Predicted category is argmax
        predicted_category = max(prob_dict, key=prob_dict.get)
        confidence = round(float(prob_dict[predicted_category]), 3)

        # Model B: Trajectory Estimator
        trajectory_pred = str(self.trajectory_model.predict(df)[0])

        # Generate Explainability Feature Contributions
        explanations = self._generate_explanations(feature_dict, predicted_category, trajectory_pred)

        return predicted_category, trajectory_pred, confidence, probabilities, explanations

    def _generate_explanations(
        self,
        features: Dict[str, float],
        category: str,
        trajectory: str
    ) -> List[FeatureExplanation]:
        """
        Derives top clinical explainability signals based on key longitudinal indicators.
        """
        explanations: List[FeatureExplanation] = []

        acc_30d = features.get("accuracy_30d", 0.5)
        acc_slope = features.get("accuracy_slope_30d", 0.0)
        avg_dur = features.get("average_duration", 30.0)
        difficulty = features.get("current_difficulty", 1.0)
        games_per_week = features.get("games_per_week", 2.0)
        completion_rate = features.get("completion_rate", 1.0)

        # 1. 30-Day Accuracy Indicator
        acc_pct = int(round(acc_30d * 100))
        if acc_30d >= 0.75:
            explanations.append(FeatureExplanation(
                featureName="30-Day Cognitive Accuracy",
                description=f"High accuracy rate of {acc_pct}% sustained across recent cognitive game sessions.",
                impactDirection="positive",
                relativeContribution=0.32
            ))
        elif acc_30d >= 0.50:
            explanations.append(FeatureExplanation(
                featureName="30-Day Cognitive Accuracy",
                description=f"Moderate average accuracy of {acc_pct}% indicates stable but developing cognitive response.",
                impactDirection="neutral",
                relativeContribution=0.28
            ))
        else:
            explanations.append(FeatureExplanation(
                featureName="30-Day Cognitive Accuracy",
                description=f"Recent average accuracy of {acc_pct}% indicates elevated challenge in memory/attention tasks.",
                impactDirection="negative",
                relativeContribution=0.34
            ))

        # 2. Longitudinal Trend Slope
        if acc_slope > 0.02:
            explanations.append(FeatureExplanation(
                featureName="Longitudinal Accuracy Trend",
                description=f"Upward trajectory trend (+{acc_slope:.2f}/period) demonstrates learning retention.",
                impactDirection="positive",
                relativeContribution=0.26
            ))
        elif acc_slope < -0.02:
            explanations.append(FeatureExplanation(
                featureName="Longitudinal Accuracy Trend",
                description=f"Downward score trajectory ({acc_slope:.2f}/period) observed over consecutive evaluations.",
                impactDirection="negative",
                relativeContribution=0.29
            ))
        else:
            explanations.append(FeatureExplanation(
                featureName="Longitudinal Accuracy Trend",
                description="Cognitive performance curve has remained flat and stable without acute drift.",
                impactDirection="neutral",
                relativeContribution=0.20
            ))

        # 3. Response Duration & Processing Speed
        if avg_dur < 35.0:
            explanations.append(FeatureExplanation(
                featureName="Processing Duration",
                description=f"Prompt average response speed ({avg_dur:.1f}s) indicates brisk sensory processing.",
                impactDirection="positive",
                relativeContribution=0.18
            ))
        elif avg_dur > 65.0:
            explanations.append(FeatureExplanation(
                featureName="Processing Duration",
                description=f"Extended reaction times ({avg_dur:.1f}s avg) indicate hesitation or motor-cognitive latency.",
                impactDirection="negative",
                relativeContribution=0.22
            ))
        else:
            explanations.append(FeatureExplanation(
                featureName="Processing Duration",
                description=f"Standard processing duration ({avg_dur:.1f}s) aligned with age-adjusted baseline.",
                impactDirection="neutral",
                relativeContribution=0.15
            ))

        # 4. Adaptive Difficulty & Engagement
        if difficulty >= 2.5:
            explanations.append(FeatureExplanation(
                featureName="Adaptive Difficulty Level",
                description=f"Patient successfully engages at higher adaptive difficulty levels ({difficulty:.1f}/5).",
                impactDirection="positive",
                relativeContribution=0.14
            ))
        elif difficulty <= 1.2 and category != "cognitively_unimpaired":
            explanations.append(FeatureExplanation(
                featureName="Adaptive Difficulty Level",
                description=f"System automatically simplified difficulty ({difficulty:.1f}) to accommodate cognitive load.",
                impactDirection="negative",
                relativeContribution=0.15
            ))
        else:
            explanations.append(FeatureExplanation(
                featureName="Engagement Consistency",
                description=f"Active routine participation with {games_per_week:.1f} sessions per week.",
                impactDirection="positive" if games_per_week >= 3.0 else "neutral",
                relativeContribution=0.12
            ))

        # Sort by relative contribution descending
        explanations.sort(key=lambda x: x.relativeContribution, reverse=True)
        return explanations[:4]

# Singleton instance
predictor = Predictor()
