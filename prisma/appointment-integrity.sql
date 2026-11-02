-- Existing historical overlaps are retained for review. These indexes reject new exact-slot duplicates.
CREATE UNIQUE INDEX IF NOT EXISTS appointments_active_doctor_start_unique
ON appointments ("doctorId", "startTime")
WHERE status IN ('SCHEDULED', 'CONFIRMED', 'RESCHEDULED');

CREATE UNIQUE INDEX IF NOT EXISTS appointments_active_patient_start_unique
ON appointments ("patientId", "startTime")
WHERE status IN ('SCHEDULED', 'CONFIRMED', 'RESCHEDULED');

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'appointments'::regclass AND conname = 'appointments_positive_duration') THEN
    ALTER TABLE appointments ADD CONSTRAINT appointments_positive_duration CHECK ("endTime" > "startTime");
  END IF;
END $$;
