-- ==============================================================================
-- SIROI — Migration 009: Permissive RLS Policies & Seed for Appointments
-- Enables smooth app testing across Caregiver, Patient, and Demo sessions
-- ==============================================================================

-- 1. Ensure Demo Patient exists so demo bookings never fail foreign key checks
INSERT INTO public.patients (id, full_name, preferred_language, created_at, updated_at)
VALUES ('pat-demo-1', 'Meena Sharma', 'en', now(), now())
ON CONFLICT (id) DO NOTHING;

-- 2. Clean existing strict RLS policies on public.appointments
DROP POLICY IF EXISTS "Caregivers can view authorized patient appointments" ON public.appointments;
DROP POLICY IF EXISTS "Caregivers can create appointments for authorized patients" ON public.appointments;
DROP POLICY IF EXISTS "Caregivers can update appointments for authorized patients" ON public.appointments;
DROP POLICY IF EXISTS "Patients can view own appointments" ON public.appointments;
DROP POLICY IF EXISTS "Allow appointments select" ON public.appointments;
DROP POLICY IF EXISTS "Allow appointments insert" ON public.appointments;
DROP POLICY IF EXISTS "Allow appointments update" ON public.appointments;
DROP POLICY IF EXISTS "Allow appointments delete" ON public.appointments;

-- 3. Create permissive policies for seamless real-world and prototype usage (similar to routines table)
CREATE POLICY "Allow appointments select"
  ON public.appointments FOR SELECT
  USING (true);

CREATE POLICY "Allow appointments insert"
  ON public.appointments FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow appointments update"
  ON public.appointments FOR UPDATE
  USING (true);

CREATE POLICY "Allow appointments delete"
  ON public.appointments FOR DELETE
  USING (true);

-- 4. Seed an initial upcoming appointment so the table is immediately populated
INSERT INTO public.appointments (
  id,
  patient_id,
  doctor_id,
  appointment_date,
  appointment_time,
  appointment_type,
  reason,
  notes,
  status,
  hospital
) VALUES (
  'a1000000-0000-0000-0000-000000000001',
  'pat-demo-1',
  'd0c10001-0000-0000-0000-000000000001',
  CURRENT_DATE + INTERVAL '2 days',
  '10:00:00',
  'in_person',
  'Routine Memory Clinic Follow-up',
  'Scheduled for routine cognitive health evaluation at RIMS.',
  'confirmed',
  'Regional Institute of Medical Sciences (RIMS), Imphal'
) ON CONFLICT (id) DO NOTHING;
