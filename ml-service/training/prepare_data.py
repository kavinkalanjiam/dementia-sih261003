"""
SIROI ML Training — Longitudinal Clinical Dataset Preparation
Generates a clinical research cohort modeling OASIS-2 / NACC longitudinal distributions.
Guarantees multi-visit longitudinal structure for strict patient-level splitting.
"""
import numpy as np
import pandas as pd
from typing import Tuple

def generate_longitudinal_clinical_cohort(n_subjects: int = 400, random_state: int = 42) -> pd.DataFrame:
    """
    Generates a longitudinal cohort modeling OASIS-2 clinical assessments across multiple visits.
    Each subject has 2 to 4 repeated visits separated by 180 to 730 days.
    """
    np.random.seed(random_state)
    records = []

    # Clinical groups: 50% Nondemented (unimpaired), 32% MCI / Converted, 18% Demented
    group_assignments = np.random.choice(
        ['cognitively_unimpaired', 'mild_cognitive_impairment', 'dementia'],
        size=n_subjects,
        p=[0.50, 0.32, 0.18]
    )

    for i in range(n_subjects):
        subject_id = f"OAS2_{i+1:04d}"
        baseline_group = group_assignments[i]
        
        # Demographic parameters
        age = np.random.normal(75, 7.5)
        age = np.clip(age, 60, 95)
        education_years = np.random.choice([8, 12, 14, 16, 18], p=[0.10, 0.30, 0.20, 0.25, 0.15])
        gender = np.random.choice(['M', 'F'], p=[0.48, 0.52])

        # Baseline cognitive markers according to group
        if baseline_group == 'cognitively_unimpaired':
            base_mmse = np.random.normal(29.0, 1.0)
            base_cdr = 0.0
            annual_decline_rate = np.random.normal(0.05, 0.1) # stable / very slow
        elif baseline_group == 'mild_cognitive_impairment':
            base_mmse = np.random.normal(25.5, 1.5)
            base_cdr = 0.5
            annual_decline_rate = np.random.normal(0.8, 0.4) # moderate decline
        else: # dementia
            base_mmse = np.random.normal(20.0, 2.5)
            base_cdr = np.random.choice([1.0, 2.0], p=[0.75, 0.25])
            annual_decline_rate = np.random.normal(1.8, 0.6) # progressive decline

        base_mmse = np.clip(base_mmse, 12, 30)

        # Baseline game/functional response proxies (0-100 scale)
        base_accuracy = (base_mmse / 30.0) * 88.0 + np.random.normal(0, 4.0)
        base_accuracy = np.clip(base_accuracy, 25.0, 98.0)
        base_consistency = np.random.uniform(5.0, 18.0)
        base_duration = 35.0 + (30.0 - base_mmse) * 3.5 + np.random.normal(0, 4.0)

        # Generate 2 to 4 repeated longitudinal visits
        n_visits = np.random.choice([2, 3, 4], p=[0.40, 0.45, 0.15])
        cum_delay = 0

        for visit in range(1, n_visits + 1):
            if visit > 1:
                visit_gap_days = np.random.choice([180, 270, 365, 540])
                cum_delay += visit_gap_days
            else:
                visit_gap_days = 0

            years_elapsed = cum_delay / 365.25
            current_age = age + years_elapsed

            # Progressive cognitive status over time
            visit_mmse = base_mmse - (annual_decline_rate * years_elapsed) + np.random.normal(0, 0.4)
            visit_mmse = np.clip(visit_mmse, 8.0, 30.0)

            # Determine current category
            if visit_mmse >= 27.5 and base_cdr < 0.5:
                current_category = 'cognitively_unimpaired'
                current_cdr = 0.0
            elif visit_mmse >= 23.0:
                current_category = 'mild_cognitive_impairment'
                current_cdr = 0.5
            else:
                current_category = 'dementia'
                current_cdr = 1.0 if visit_mmse >= 18 else 2.0

            # Corresponding longitudinal features at this visit
            visit_accuracy = (visit_mmse / 30.0) * 88.0 + np.random.normal(0, 3.5)
            visit_accuracy = np.clip(visit_accuracy, 20.0, 99.0)
            
            # Slopes over recent 30-90 days window strongly reflect trajectory
            accuracy_slope = - (annual_decline_rate * 3.2) + np.random.normal(0, 0.5)
            duration_current = base_duration + (30.0 - visit_mmse) * 2.2 + np.random.normal(0, 2.0)

            # 6-month future trajectory classification label
            if accuracy_slope < -2.2 or annual_decline_rate > 0.85:
                future_trajectory = 'declining'
            elif accuracy_slope > 0.4 or annual_decline_rate < 0.05 and visit_accuracy > 85.0:
                future_trajectory = 'improving'
            else:
                future_trajectory = 'stable'

            records.append({
                'subject_id': subject_id,
                'visit': visit,
                'visit_delay_days': cum_delay,
                'age': round(current_age, 1),
                'gender': gender,
                'education_years': education_years,
                'mmse': round(visit_mmse, 1),
                'cdr': current_cdr,
                'accuracy_mean': round(visit_accuracy, 2),
                'accuracy_last_5': round(visit_accuracy + np.random.normal(0, 2.0), 2),
                'accuracy_last_10': round(visit_accuracy + np.random.normal(0, 1.8), 2),
                'accuracy_30d': round(visit_accuracy + np.random.normal(0, 1.5), 2),
                'accuracy_slope_30d': round(accuracy_slope, 3),
                'accuracy_std': round(base_consistency + np.random.normal(0, 1.5), 2),
                'score_mean': round(visit_accuracy * 1.1, 1),
                'average_duration': round(duration_current, 1),
                'completion_rate': round(np.clip(0.95 - (annual_decline_rate * 0.08), 0.5, 1.0), 2),
                'games_per_week': round(max(2.0, 6.5 - annual_decline_rate * 1.2), 1),
                'current_difficulty': 3 if visit_mmse > 26 else (2 if visit_mmse > 22 else 1),
                'category_label': current_category,
                'trajectory_label': future_trajectory
            })

    df = pd.DataFrame(records)
    return df

if __name__ == '__main__':
    df = generate_longitudinal_clinical_cohort()
    print(f"Generated cohort: {len(df)} visits across {df['subject_id'].nunique()} distinct subjects.")
    print("Category distribution:\n", df['category_label'].value_counts())
    print("Trajectory distribution:\n", df['trajectory_label'].value_counts())
