# Phase 8: Four Specialized AI Agents Implementation Report

## Overview
Hospital AI Lab features four specialized autonomous clinical agents running in Node.js and TypeScript, powered by Ollama local LLM inference (with fallback rule-based execution). Each agent operates within strictly defined security, authorization, and domain boundaries.

---

## 1. Agent Architecture & Responsibilities

### 1.1 Agent 1: Appointment Agent (`appointment-agent`)
- **Domain**: Scheduling, doctor availability, appointment management.
- **Allowed Tools**:
  - `get_doctors`: Look up active physicians and specialties.
  - `get_available_slots`: Query live open schedule slots for a doctor on a given date.
  - `get_appointment_by_id`: Retrieve verified appointment details with ownership check.
  - `get_appointments`: List active appointments scoped to caller's role and patient assignment.
  - `validate_appointment_booking`: Read-only preflight authorization check.
  - `book_appointment`: Mutation tool to book an appointment (enforces assignment and conflict checks).
  - `reschedule_appointment`: Change time of an existing appointment.
  - `cancel_appointment`: Cancel an active appointment.
  - `transfer_to_agent`: Handoff to another specialized agent.

### 1.2 Agent 2: Patient Records Agent (`records-agent`)
- **Domain**: Clinical documentation, medical history, consultations, prescriptions.
- **Allowed Tools**:
  - `get_patient_profile`: Fetch patient demographic and emergency profile (scoped to assigned doctor or patient themselves).
  - `get_medical_history`: Retrieve diagnosed conditions, allergies, and past surgeries.
  - `get_consultation_notes`: Review clinical notes from prior visits.
  - `get_prescriptions`: View active and historical medication regimens.
  - `transfer_to_agent`: Handoff to another specialized agent.

### 1.3 Agent 3: Lab Report Agent (`lab-agent`)
- **Domain**: Diagnostic test results, pathology, reference ranges, abnormality summaries.
- **Allowed Tools**:
  - `get_lab_report`: Retrieve specific lab order and test results (scoped to owner patient or assigned doctor).
  - `get_lab_status`: Check status of pending lab specimens (`ORDERED`, `IN_PROGRESS`, `COMPLETED`).
  - `summarize_lab_report`: Generate patient-friendly clinical summaries of reported values against standard reference ranges without inventing results.
  - `transfer_to_agent`: Handoff to another specialized agent.

### 1.4 Agent 4: Care Coordinator (`care-agent`)
- **Domain**: Hospital policies, support tickets, follow-ups, multidisciplinary routing.
- **Allowed Tools**:
  - `create_support_ticket`: Open support inquiry with subject, description, and priority.
  - `get_support_ticket`: Retrieve ticket details and status.
  - `list_my_support_tickets`: Paginate user's support tickets.
  - `get_hospital_faq`: Search hospital operational policies, visiting hours, and departments.
  - `transfer_to_agent`: Handoff to specialized agents.

---

## 2. Security & Privacy Boundaries

1. **Authenticated Server Context**: The agent runner receives the authenticated `User` context (`id`, `role`, `doctorProfile`, `patientProfile`). User-supplied prompts cannot override system role assignments.
2. **Backend Tool Authorization**: Every tool execution passes through `ToolRegistry.execute()` which validates permissions before touching the database.
3. **No Fabricated Records**: If an appointment, patient, or lab report is not found in the database, the agent reports `NOT FOUND` rather than inventing synthetic identifiers or clinical values.
4. **Audit Trail**: Every execution records `AgentExecution` and `AgentStep` records in PostgreSQL, capturing duration, input parameters, tool name, and authorization decision.
