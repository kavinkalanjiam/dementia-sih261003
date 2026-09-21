-- SIROI — Machine Learning Cognitive Analysis & Longitudinal Prediction Table
-- Migration: 007_create_ml_predictions_table.sql

CREATE TABLE IF NOT EXISTS public.ml_predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  model_version TEXT NOT NULL DEFAULT 'siroi-cognitive-v1',
  prediction_type TEXT NOT NULL DEFAULT 'longitudinal_cognitive_analysis',
  predicted_category TEXT NOT NULL CHECK (predicted_category IN ('cognitively_unimpaired', 'mild_cognitive_impairment', 'dementia', 'insufficient_data')),
  trajectory TEXT NOT NULL CHECK (trajectory IN ('stable', 'improving', 'declining', 'insufficient_data')),
  prediction_horizon_days INTEGER NOT NULL DEFAULT 180,
  confidence NUMERIC(4, 3) NOT NULL DEFAULT 0.000,
  category_probabilities JSONB DEFAULT '{}'::jsonb,
  features_snapshot JSONB DEFAULT '{}'::jsonb,
  explanation JSONB DEFAULT '[]'::jsonb,
  insufficient_data_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for rapid lookup of latest patient prediction
CREATE INDEX IF NOT EXISTS idx_ml_predictions_patient ON public.ml_predictions(patient_id);
CREATE INDEX IF NOT EXISTS idx_ml_predictions_created ON public.ml_predictions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ml_predictions_version ON public.ml_predictions(model_version);

-- Enable Row-Level Security
ALTER TABLE public.ml_predictions ENABLE ROW LEVEL SECURITY;

-- Allow caregivers to read predictions for their assigned patients
CREATE POLICY "Caregivers can view predictions for assigned patients"
  ON public.ml_predictions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.caregiver_patients cp
      WHERE cp.caregiver_id = auth.uid()
        AND cp.patient_id = ml_predictions.patient_id
        AND cp.status = 'active'
    )
    OR
    EXISTS (
      SELECT 1 FROM public.patients p
      WHERE p.id = ml_predictions.patient_id
        AND p.user_id = auth.uid()
    )
  );

-- Allow authenticated service / caregiver to insert predictions
CREATE POLICY "Authorized users can insert predictions"
  ON public.ml_predictions
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Enable Supabase Realtime for ml_predictions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'ml_predictions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ml_predictions;
  END IF;
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;
