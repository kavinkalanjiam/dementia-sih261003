# SIROI Machine Learning Cognitive Analysis & Longitudinal Prediction Module

## 1. System Overview
The **SIROI ML Cognitive Analysis System** provides longitudinal cognitive performance tracking and decision-support trend estimation for authorized caregivers.

### Medical Safety & Ethics Safeguards
- **Non-Diagnostic**: This system is strictly a decision-support research tool. It does **not** diagnose dementia, Alzheimer's, or any medical condition.
- **Language Protocol**: Outputs use conservative, non-alarming terminology:
  - *Model-estimated cognitive category*
  - *Cognitive performance trend*
  - *Estimated future trajectory (180-day / 6-month horizon)*
  - *Elevated cognitive-risk signal*
  - *Consider clinical evaluation*
- **Elderly Shielding**: Detailed predictions and diagnostic estimates are never displayed to the elderly patient to prevent psychological distress or disorientation.

---

## 2. Model Architecture & Strategy

### Model A — Current Cognitive Category Classifier
- **Target Variable**: `predicted_category`
  - `cognitively_unimpaired` (Clinical Dementia Rating CDR 0, MMSE 28-30)
  - `mild_cognitive_impairment` (CDR 0.5, MMSE 24-27)
  - `dementia` (CDR $\ge$ 1.0, MMSE $< 24$)
- **Model Family**: Calibrated Random Forest Classifier (`RandomForestClassifier` with `CalibratedClassifierCV`) & HistGradientBoosting baseline.
- **Model Version**: `siroi-cognitive-v1`

### Model B — Future Cognitive Trajectory Estimator
- **Target Variable**: `trajectory` (Estimated change over a **180-day / 6-month follow-up horizon**)
  - `stable`: Performance trend within $\pm 4\%$ variance window.
  - `improving`: Upward cognitive engagement / accuracy slope $> +4\%$.
  - `declining`: Progressive downward slope $> -4\%$, accompanied by elevated duration or reduced difficulty progression.
- **Model Version**: `siroi-cognitive-v1`

---

## 3. Training & Validation Data

### Clinical Research Baseline: OASIS-2 Longitudinal Cohort
- **Source**: Open Access Series of Imaging Studies (OASIS-2: Longitudinal MRI & Clinical Data in Nondemented and Demented Older Adults; Marcus et al., Washington University).
- **Licensing**: Open Access Creative Commons (CC-BY 4.0 / Open Data).
- **Variables Utilized**:
  - Longitudinal visits ($V_1, V_2, V_3$, Visit Delay in days)
  - Clinical Dementia Rating (`CDR`: 0.0, 0.5, 1.0, 2.0)
  - Mini-Mental State Examination (`MMSE`: 0–30)
  - Functional & Cognitive scores (Estimated Total Intracranial Volume, Normalized Whole Brain Volume)
  - Age, Education Level, Baseline Socioeconomic Status.

### Separation of Clinical Data and SIROI Game Data
- Clinical public datasets do not measure touchscreen game mechanics (`accuracy_last_5`, `memory_card_accuracy`, etc.).
- The training pipeline models clinical cognitive trajectories, while the application-level feature engineering pipeline computes patient-specific longitudinal trends from real SIROI `game_attempts`.

---

## 4. Preventing Data Leakage: Patient-Level Splitting
To eliminate data leakage between repeated longitudinal assessments:
- We enforce **patient-level splitting** via `GroupShuffleSplit` on `subject_id`.
- 100% of a patient's historical visits are placed exclusively in either the training set or the test set—never split across both.
- For trajectory predictions, temporal ordering is strictly preserved; future data is never used to predict historical states.

---

## 5. SIROI Application-Level Feature Engineering
For each patient, the system extracts:
1. **Recent Performance**: `accuracy_last_5`, `accuracy_last_10`, `accuracy_last_20`
2. **Time Windows**: `accuracy_7d`, `accuracy_30d`, `accuracy_90d`
3. **Game-Specific Metrics**:
   - `memory-match`, `sequence-recall`, `name-face`, `familiar-places`, `number-memory`, `voice-recall`, `object-recall`, `story-recall`, `familiar-sounds`
4. **Longitudinal Slopes**:
   - `accuracy_slope_7d`, `accuracy_slope_30d`, `accuracy_slope_90d`, `score_slope`, `duration_slope`
5. **Consistency Metrics**:
   - `accuracy_mean`, `accuracy_std`, `score_mean`, `score_std`, `completion_rate`, `games_per_week`
6. **Response-Time Trends**:
   - `average_duration`, `recent_average_duration`, `duration_trend`
7. **Adaptive Difficulty Metrics**:
   - `current_difficulty`, `highest_completed_difficulty`, `difficulty_progression_rate`, `difficulty_regression_count`

### Minimum Data Requirement Guard
If a patient has fewer than **3 completed game attempts**, the system refuses to generate speculative predictions and outputs an informative `insufficient_data` response:
> *"Not enough longitudinal data yet. Continue using SIROI activities and assessments to build a meaningful history. (Current records: X game sessions)"*

---

## 6. Model Evaluation Metrics

| Metric | Target / Benchmark |
|---|---|
| Balanced Accuracy | $> 84\%$ |
| Macro F1-Score | $> 82\%$ |
| ROC-AUC (One-vs-Rest) | $> 0.88$ |
| Probability Brier Score | $< 0.12$ (Well-calibrated) |

---

## 7. Model Versioning & Output Schema
Every prediction record in Supabase `ml_predictions` tracks:
- `model_version`: `siroi-cognitive-v1`
- `prediction_type`: `longitudinal_cognitive_analysis`
- `predicted_category`: Categorical outcome with probability distribution
- `trajectory`: 6-month projected trend
- `prediction_horizon_days`: 180
- `confidence`: Calibrated model confidence score
- `explanation`: Top contributing features explained in plain language
