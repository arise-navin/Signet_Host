# Phase 7: Patient Symptom Submission & AI Doctor Recommendation Implementation Report

## Overview
Phase 7 introduces the AI-guided clinical routing and triage engine in Hospital AI Lab. It enables patients to describe symptoms in conversational language, receive immediate emergency safety warnings when applicable, receive AI-inferred specialty routing recommendations, browse real matching physicians with live availability, and complete 1-click appointment booking with durable database persistence.

---

## 1. Safety-First Clinical Triage Architecture

### 1.1 Non-Diagnostic Specialty Routing
- **Clinical Clarification**: The AI engine explicitly acts as a specialty-routing navigator, not a diagnostic authority. Every recommendation carries clear medical advisories that recommendations assist with scheduling the appropriate specialist and do not substitute for in-person medical evaluation.

### 1.2 Emergency Symptom Detection & Triage Warning
- **Critical Symptom Heuristics**: The system analyzes input for high-acuity indicators (e.g., severe acute chest pain, radiating arm/jaw discomfort, shortness of breath, sudden neurological deficits, severe hemorrhaging, suicidal ideation).
- **Immediate Escalation Protocol**:
  - Sets `isEmergency: true`.
  - Assigns priority `HIGH` or `CRITICAL`.
  - Displays prominent emergency red banner: *"Immediate Medical Attention Advised: Your symptoms may indicate a potentially life-threatening emergency. Please call 911 or proceed immediately to the nearest Emergency Department. Do not wait for a scheduled outpatient consultation."*

### 1.3 Specialty Inference Mapping
- Maps natural language symptoms to verified hospital departments and specialties:
  - Chest pain, palpitations, hypertension $\rightarrow$ **Cardiology**
  - Persistent headache, numbness, seizures, tremors $\rightarrow$ **Neurology**
  - Joint stiffness, bone fractures, ligament tears $\rightarrow$ **Orthopedics**
  - Skin rashes, lesions, eczema, severe hives $\rightarrow$ **Dermatology**
  - Pediatric concerns, infant fever $\rightarrow$ **Pediatrics**
  - General malaise, fever, cold, fatigue $\rightarrow$ **General Medicine**

---

## 2. Real Doctor Retrieval & Availability

### 2.1 No Fabricated Doctors
- Matches the inferred specialty against active doctors in PostgreSQL:
  ```ts
  const matchingDoctors = await prisma.doctor.findMany({
    where: {
      isActive: true,
      specialty: { name: { contains: specialty, mode: 'insensitive' } },
    },
    include: { user: true, department: true },
  });
  ```
- If no exact specialty match is found, safely falls back to active **General Medicine** or internal medicine physicians.

### 2.2 Live Real-Time Slot Generation
- For each matched doctor, the system calculates future available slots based on their weekly schedule shifts (`DoctorSchedule`) while strictly filtering out existing booked or active appointments (`Appointment`).

---

## 3. Database Persistence & Workflow Progression

### 3.1 Relational Models
1. `PatientSymptomRequest`:
   - Records `patientId`, `rawSymptomText`, `urgencyScore`, `suggestedSpecialty`, `isEmergency`, and `status`.
2. `AIRecommendation`:
   - Records `requestId`, `recommendedSpecialty`, `confidenceScore`, `clinicalRationale`, `recommendedDoctorIds` (UUID array), `selectedDoctorId`, `status` (`GENERATED`, `VIEWED`, `ACCEPTED`, `BOOKED`), and linked `appointmentId`.

### 3.2 1-Click Booking Transaction
Endpoint: `POST /api/patient/symptoms/:id/book`
- Validates the chosen slot against `DoctorSchedule` and ensures no active appointment conflict exists.
- In a single transactional operation:
  1. Creates the `Appointment` with status `SCHEDULED`.
  2. Updates `AIRecommendation` status to `BOOKED` with `appointmentId`.
  3. Updates `PatientSymptomRequest` status to `RESOLVED`.
  4. Automatically creates a `DoctorPatientAssignment` care relationship if not already established.

---

## 4. Verification & Testing

Verified across integration suites:
- Symptom submission correctly persists `PatientSymptomRequest` and `AIRecommendation`.
- Emergency triage warning triggers on acute chest pain symptoms.
- Non-emergency symptoms successfully retrieve verified Cardiology doctors.
- Booking succeeds, updates recommendation status to `BOOKED`, and links the created appointment.
