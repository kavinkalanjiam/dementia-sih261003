-- ==============================================================================
-- SIROI — Doctor Appointment Booking & Doctors Schema Migration
-- Migration 008: Adds doctors and appointments tables with strict RLS and Realtime
-- ==============================================================================

-- 1. Doctors Table
CREATE TABLE IF NOT EXISTS public.doctors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  specialization TEXT NOT NULL DEFAULT 'General Physician',
  hospital TEXT DEFAULT 'SIROI Health Network',
  phone TEXT,
  consultation_type TEXT NOT NULL DEFAULT 'both' CHECK (consultation_type IN ('in_person', 'video', 'both')),
  available BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Appointments Table
CREATE TABLE IF NOT EXISTS public.appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  caregiver_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  doctor_id UUID NOT NULL REFERENCES public.doctors(id) ON DELETE RESTRICT,
  appointment_date DATE NOT NULL,
  appointment_time TIME NOT NULL,
  appointment_type TEXT NOT NULL CHECK (appointment_type IN ('in_person', 'video')),
  reason TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'rescheduled', 'completed', 'cancelled')),
  hospital TEXT,
  meeting_link TEXT,
  cancelled_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Indexes for Efficient Query Performance
CREATE INDEX IF NOT EXISTS idx_appointments_patient ON public.appointments(patient_id);
CREATE INDEX IF NOT EXISTS idx_appointments_caregiver ON public.appointments(caregiver_id);
CREATE INDEX IF NOT EXISTS idx_appointments_doctor ON public.appointments(doctor_id);
CREATE INDEX IF NOT EXISTS idx_appointments_date ON public.appointments(appointment_date);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON public.appointments(status);
CREATE INDEX IF NOT EXISTS idx_doctors_specialization ON public.doctors(specialization);

-- 4. Automatic Timestamp Update Triggers
CREATE OR REPLACE TRIGGER tr_doctors_updated_at
  BEFORE UPDATE ON public.doctors
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE OR REPLACE TRIGGER tr_appointments_updated_at
  BEFORE UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 5. Row Level Security (RLS)
ALTER TABLE public.doctors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

-- Doctors Policies (Visible to all authenticated users & anon for demo mode)
CREATE POLICY "Anyone can view doctors directory"
  ON public.doctors FOR SELECT
  USING (true);

-- Appointments Policies
-- A. Patients can view ONLY their own appointments
CREATE POLICY "Patients can view own appointments"
  ON public.appointments FOR SELECT
  USING (public.is_patient_self(patient_id));

-- B. Caregivers can view appointments ONLY for authorized patients
CREATE POLICY "Caregivers can view authorized patient appointments"
  ON public.appointments FOR SELECT
  USING (public.is_caregiver_for_patient(patient_id));

-- C. Caregivers can insert appointments ONLY for authorized patients
CREATE POLICY "Caregivers can create appointments for authorized patients"
  ON public.appointments FOR INSERT
  WITH CHECK (
    public.is_caregiver_for_patient(patient_id) AND
    caregiver_id = auth.uid()
  );

-- D. Caregivers can update/reschedule/cancel appointments ONLY for authorized patients
CREATE POLICY "Caregivers can update appointments for authorized patients"
  ON public.appointments FOR UPDATE
  USING (public.is_caregiver_for_patient(patient_id))
  WITH CHECK (public.is_caregiver_for_patient(patient_id));

-- 6. Enable Realtime Publications for Live Cross-Device Sync
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'appointments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.appointments;
  END IF;
END $$;

-- 7. Seed Initial Demo Healthcare Providers (North Eastern Regional Medical Network)
INSERT INTO public.doctors (id, name, specialization, hospital, phone, consultation_type, available)
VALUES
  ('d0c10001-0000-0000-0000-000000000001', 'Dr. P. Barua', 'Neurology & Cognitive Health', 'Guwahati Neurological Institute, Assam', '+91 94350 12345', 'both', true),
  ('d0c10001-0000-0000-0000-000000000002', 'Dr. Arun Sharma', 'Geriatric Medicine', 'Dispur Care Clinic, Guwahati', '+91 94351 23456', 'both', true),
  ('d0c10001-0000-0000-0000-000000000003', 'Dr. Meena Das', 'Neuropsychology & Memory Care', 'Assam Medical College Hospital', '+91 94352 34567', 'video', true),
  ('d0c10001-0000-0000-0000-000000000004', 'Dr. Rajesh Roy', 'General Physician & Elder Wellness', 'Shillong Civil Hospital, Meghalaya', '+91 94353 45678', 'in_person', true)
ON CONFLICT (id) DO NOTHING;
