"""
SIROI ML Training — Main Training & Model Serialization Pipeline
Trains Model A (Cognitive Category) and Model B (Future Trajectory)
using strict patient-level splitting and probability calibration.
"""
import os
import json
import joblib
import numpy as np
from sklearn.pipeline import Pipeline
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier, HistGradientBoostingClassifier
from sklearn.calibration import CalibratedClassifierCV

from prepare_data import generate_longitudinal_clinical_cohort
from feature_engineering import NUMERIC_FEATURES, get_preprocessor, patient_level_split
from evaluate import evaluate_classification_model

CATEGORY_LABELS = ['cognitively_unimpaired', 'mild_cognitive_impairment', 'dementia']
TRAJECTORY_LABELS = ['stable', 'improving', 'declining']
MODEL_VERSION = "siroi-cognitive-v1"

def train_and_export_models():
    print(f"=== SIROI ML TRAINING PIPELINE (Version: {MODEL_VERSION}) ===")
    
    # 1. Generate longitudinal clinical dataset
    df = generate_longitudinal_clinical_cohort(n_subjects=450, random_state=42)
    print(f"Cohort loaded: {len(df)} visit instances across {df['subject_id'].nunique()} subjects.")

    # 2. Patient-Level Split (Zero Data Leakage)
    train_df, test_df = patient_level_split(df, subject_col='subject_id', test_size=0.20, random_state=42)
    print(f"Train set: {len(train_df)} records ({train_df['subject_id'].nunique()} subjects)")
    print(f"Test set:  {len(test_df)} records ({test_df['subject_id'].nunique()} subjects)")

    X_train = train_df[NUMERIC_FEATURES]
    X_test = test_df[NUMERIC_FEATURES]

    # Output directory
    script_dir = os.path.dirname(os.path.abspath(__file__))
    models_dir = os.path.join(os.path.dirname(script_dir), "models")
    os.makedirs(models_dir, exist_ok=True)

    # -------------------------------------------------------------
    # MODEL A: CURRENT COGNITIVE CATEGORY ESTIMATE
    # -------------------------------------------------------------
    print("\n--- Training Model A: Cognitive Category Classifier ---")
    y_train_cat = train_df['category_label']
    y_test_cat = test_df['category_label']

    # Compare Baseline Logistic Regression vs Calibrated Random Forest
    baseline_lr = Pipeline([
        ('preprocessor', get_preprocessor()),
        ('classifier', LogisticRegression(max_iter=1000, random_state=42))
    ])
    baseline_lr.fit(X_train, y_train_cat)
    eval_lr = evaluate_classification_model(baseline_lr, X_test, y_test_cat, CATEGORY_LABELS, "LogisticRegression Baseline")
    print(f"Logistic Regression Macro F1: {eval_lr['f1_macro']} | Balanced Acc: {eval_lr['balanced_accuracy']}")

    rf_raw = Pipeline([
        ('preprocessor', get_preprocessor()),
        ('classifier', RandomForestClassifier(n_estimators=120, max_depth=7, min_samples_split=4, random_state=42))
    ])
    rf_raw.fit(X_train, y_train_cat)

    # Calibrate probabilities
    calibrated_cat_model = CalibratedClassifierCV(estimator=rf_raw, method='sigmoid', cv=3)
    calibrated_cat_model.fit(X_train, y_train_cat)
    eval_cat = evaluate_classification_model(calibrated_cat_model, X_test, y_test_cat, CATEGORY_LABELS, "Calibrated Random Forest")
    print(f"Calibrated RF Macro F1: {eval_cat['f1_macro']} | Balanced Acc: {eval_cat['balanced_accuracy']} | ROC-AUC: {eval_cat.get('roc_auc_ovr')}")

    cat_model_path = os.path.join(models_dir, "category_model_v1.joblib")
    joblib.dump(calibrated_cat_model, cat_model_path)
    print(f"Saved Model A to: {cat_model_path}")

    # -------------------------------------------------------------
    # MODEL B: FUTURE COGNITIVE TRAJECTORY (180-DAY HORIZON)
    # -------------------------------------------------------------
    print("\n--- Training Model B: Longitudinal Trajectory Estimator ---")
    y_train_traj = train_df['trajectory_label']
    y_test_traj = test_df['trajectory_label']

    traj_pipeline = Pipeline([
        ('preprocessor', get_preprocessor()),
        ('classifier', RandomForestClassifier(n_estimators=100, max_depth=6, min_samples_split=5, random_state=42))
    ])
    calibrated_traj_model = CalibratedClassifierCV(estimator=traj_pipeline, method='sigmoid', cv=3)
    calibrated_traj_model.fit(X_train, y_train_traj)

    eval_traj = evaluate_classification_model(calibrated_traj_model, X_test, y_test_traj, TRAJECTORY_LABELS, "Trajectory Random Forest")
    print(f"Trajectory Model Macro F1: {eval_traj['f1_macro']} | Balanced Acc: {eval_traj['balanced_accuracy']} | ROC-AUC: {eval_traj.get('roc_auc_ovr')}")

    traj_model_path = os.path.join(models_dir, "trajectory_model_v1.joblib")
    joblib.dump(calibrated_traj_model, traj_model_path)
    print(f"Saved Model B to: {traj_model_path}")

    # -------------------------------------------------------------
    # EXPORT METADATA & ARTIFACT METRICS
    # -------------------------------------------------------------
    metadata = {
        "model_version": MODEL_VERSION,
        "prediction_horizon_days": 180,
        "features": NUMERIC_FEATURES,
        "category_labels": CATEGORY_LABELS,
        "trajectory_labels": TRAJECTORY_LABELS,
        "metrics": {
            "category_model": eval_cat,
            "trajectory_model": eval_traj
        },
        "disclaimer": "SIROI decision-support research estimate. Not a medical diagnosis."
    }
    meta_path = os.path.join(models_dir, "metadata_v1.json")
    with open(meta_path, "w") as f:
        json.dump(metadata, f, indent=2)
    print(f"Saved Model Metadata to: {meta_path}")

    print("\n[OK] Model training and serialization complete.")
    return metadata

if __name__ == '__main__':
    train_and_export_models()
