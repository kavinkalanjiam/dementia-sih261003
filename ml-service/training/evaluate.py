"""
SIROI ML Training — Model Evaluation Module
Calculates balanced accuracy, macro precision/recall/F1, confusion matrix, ROC-AUC, and calibration.
"""
import numpy as np
from sklearn.metrics import (
    accuracy_score,
    balanced_accuracy_score,
    precision_recall_fscore_support,
    confusion_matrix,
    roc_auc_score,
    log_loss,
    brier_score_loss
)
from typing import Dict, Any

def evaluate_classification_model(
    model,
    X_test,
    y_test,
    labels: list,
    model_name: str = "Model"
) -> Dict[str, Any]:
    """
    Computes comprehensive evaluation metrics for multi-class classification.
    """
    y_pred = model.predict(X_test)
    y_proba = model.predict_proba(X_test) if hasattr(model, "predict_proba") else None

    acc = accuracy_score(y_test, y_pred)
    bal_acc = balanced_accuracy_score(y_test, y_pred)
    precision, recall, f1, _ = precision_recall_fscore_support(y_test, y_pred, average='macro', zero_division=0)
    cm = confusion_matrix(y_test, y_pred, labels=labels)

    results = {
        'model_name': model_name,
        'accuracy': round(float(acc), 4),
        'balanced_accuracy': round(float(bal_acc), 4),
        'precision_macro': round(float(precision), 4),
        'recall_macro': round(float(recall), 4),
        'f1_macro': round(float(f1), 4),
        'confusion_matrix': cm.tolist(),
        'labels': labels
    }

    if y_proba is not None:
        try:
            auc = roc_auc_score(y_test, y_proba, multi_class='ovr', labels=labels)
            results['roc_auc_ovr'] = round(float(auc), 4)
        except Exception:
            results['roc_auc_ovr'] = None

    return results
