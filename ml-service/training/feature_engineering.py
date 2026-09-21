"""
SIROI ML Training — Feature Engineering & Patient-Level Splitting
Implements strictly patient-grouped train/test splitting to prevent data leakage across visits.
"""
import numpy as np
import pandas as pd
from sklearn.model_selection import GroupShuffleSplit
from sklearn.pipeline import Pipeline
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import StandardScaler
from sklearn.impute import SimpleImputer
from typing import Tuple, List

# Numeric features used for Category and Trajectory Modeling
NUMERIC_FEATURES: List[str] = [
    'accuracy_mean',
    'accuracy_last_5',
    'accuracy_last_10',
    'accuracy_30d',
    'accuracy_slope_30d',
    'accuracy_std',
    'score_mean',
    'average_duration',
    'completion_rate',
    'games_per_week',
    'current_difficulty',
    'age',
    'education_years'
]

def get_preprocessor() -> ColumnTransformer:
    """
    Returns a reproducible ColumnTransformer with median imputation and standardization.
    """
    numeric_transformer = Pipeline(steps=[
        ('imputer', SimpleImputer(strategy='median')),
        ('scaler', StandardScaler())
    ])

    preprocessor = ColumnTransformer(
        transformers=[
            ('num', numeric_transformer, NUMERIC_FEATURES)
        ],
        remainder='drop'
    )
    return preprocessor

def patient_level_split(
    df: pd.DataFrame,
    subject_col: str = 'subject_id',
    test_size: float = 0.20,
    random_state: int = 42
) -> Tuple[pd.DataFrame, pd.DataFrame]:
    """
    Splits the dataset strictly at the patient level using GroupShuffleSplit.
    Guarantees that 100% of a patient's historical visits belong exclusively
    to either train or test, eliminating data leakage.
    """
    gss = GroupShuffleSplit(n_splits=1, test_size=test_size, random_state=random_state)
    train_idx, test_idx = next(gss.split(df, groups=df[subject_col]))

    train_df = df.iloc[train_idx].copy()
    test_df = df.iloc[test_idx].copy()

    # Safety verification assertion
    train_subjects = set(train_df[subject_col].unique())
    test_subjects = set(test_df[subject_col].unique())
    overlap = train_subjects.intersection(test_subjects)
    if overlap:
        raise ValueError(f"CRITICAL LEAKAGE DETECTED: {len(overlap)} subjects present in both train and test!")

    return train_df, test_df
