# Hospital AI Multi-Agent Application — Agent Architecture & Tools

The system implements four specialized, autonomous clinical AI agents powered by local Ollama LLM inference. All agents share the centralized `ToolExecutor` and interact with real PostgreSQL data through Prisma.

---

## The Four AI Agents

### Agent 1: Appointment Agent
- **Identifier**: `appointment-agent`
- **Role**: Hospital scheduling concierge.
- **Responsibilities**:
  - Discover doctors and specialties across 5 clinical departments.
  - Query real-time unbooked appointment slots for specific doctors and dates.
  - Book appointments with concurrency safety (`pg_advisory_xact_lock`).
  - Reschedule and cancel appointments.
- **System Prompt Rules**:
  - Must strictly verify doctor availability before offering slots.
  - Never invents open slots; reads directly from database availabilities.
  - Confirms bookings with doctor name, department, and ISO timestamp.
- **Authorized Tools**:
  1. `get_doctors`
  2. `get_available_slots`
  3. `book_appointment`
  4. `reschedule_appointment`
  5. `cancel_appointment`

---

### Agent 2: Patient Records Agent
- **Identifier**: `records-agent`
- **Role**: Secure clinical records custodian.
- **Responsibilities**:
  - Retrieve authorized patient clinical demographics, MRN, allergies, and chronic conditions.
  - Retrieve synthetic medical history notes and physician assessments.
  - Retrieve hospital visit summaries with vitals and physician diagnoses.
  - Retrieve active prescriptions.
- **Security & Authorization Rules**:
  - Enforces patient boundary isolation: `patientId` must match the authenticated session.
  - Attempts to access other patients' records trigger a `403 Forbidden` response.
  - Receptionist users are blocked from clinical record retrieval tools.
- **Authorized Tools**:
  1. `get_patient_profile`
  2. `get_medical_history`
  3. `get_visit_summary`
  4. `get_prescriptions`

---

### Agent 3: Lab Report Agent
- **Identifier**: `lab-agent`
- **Role**: Diagnostic laboratory explainer.
- **Responsibilities**:
  - Query the status of diagnostic orders (`ORDERED`, `IN_PROGRESS`, `COMPLETED`, `REVIEW_REQUESTED`, `REVIEWED`).
  - Retrieve authorized synthetic lab reports and biomarker values.
  - Explain laboratory terminology (e.g., WBC, HDL, LDL, Fasting Glucose) in plain language.
  - Submit electronic physician review requests (`request_doctor_review`).
- **Strict Clinical Safety Boundaries**:
  - **No Diagnosing**: The agent must never declare a disease or clinical diagnosis.
  - **No Treatment Prescribing**: The agent must never instruct patients to alter medication dosages.
  - **No Result Hallucination**: Must strictly reflect stored database values.
  - **Review Escalation**: Automatically offers `request_doctor_review` when patient expresses concern.
- **Authorized Tools**:
  1. `get_lab_status`
  2. `get_lab_report`
  3. `get_lab_tests`
  4. `request_doctor_review`

---

### Agent 4: Care Coordinator Agent
- **Identifier**: `care-agent`
- **Role**: Front-door patient advocate and care concierge.
- **Responsibilities**:
  - Answer general hospital FAQ inquiries (visiting hours, parking garages, cafeteria, accepted insurance, directions).
  - Create formal patient support tickets.
  - Log care coordination follow-up requests.
  - Escalate urgent patient requests to human hospital staff.
  - Coordinate multi-agent handoffs to specialized agents.
- **Authorized Tools**:
  1. `search_hospital_faq`
  2. `create_support_ticket`
  3. `create_followup_request`
  4. `request_staff_assistance`
  5. `transfer_to_agent`

---

## Tool Registry Manifest (18 Tools)

| Tool Name | Assigned Agents | Allowed Roles | Summary Description |
|---|---|---|---|
| `get_doctors` | `appointment`, `care` | All roles | Search doctors by department or specialization |
| `get_available_slots` | `appointment` | All roles | Query open 30-min slots for a doctor on a date |
| `book_appointment` | `appointment` | All roles | Book slot with concurrency lock |
| `reschedule_appointment` | `appointment` | All roles | Reschedule existing booking |
| `cancel_appointment` | `appointment` | All roles | Cancel booking |
| `get_patient_profile` | `records` | Patient, Doctor, Admin | Retrieve authorized patient demographics & allergies |
| `get_medical_history` | `records` | Patient, Doctor, Admin | Retrieve authorized medical notes & consults |
| `get_visit_summary` | `records` | Patient, Doctor, Admin | Retrieve visit summaries and vital signs |
| `get_prescriptions` | `records` | Patient, Doctor, Admin | Retrieve active prescription medications |
| `get_lab_status` | `lab` | Patient, Doctor, Admin | Check status of ordered laboratory panels |
| `get_lab_report` | `lab` | Patient, Doctor, Admin | Retrieve test findings and reference ranges |
| `get_lab_tests` | `lab` | All roles | List hospital standard diagnostic panels |
| `request_doctor_review` | `lab` | Patient, Doctor, Admin | Submit physician review request for lab report |
| `search_hospital_faq` | `care` | All roles | Search visiting hours, parking, cafeteria, insurance |
| `create_support_ticket` | `care` | All roles | Create patient inquiry ticket |
| `create_followup_request` | `care` | All roles | Log care coordination follow-up request |
| `request_staff_assistance` | `care` | All roles | Escalate urgent request to human nursing staff |
| `transfer_to_agent` | All agents | All roles | Hand off consultation to another specialized agent |

---

## Agent Handoff & Delegation Protocol

When a user addresses the **Care Coordinator Agent** with a specialized request (such as scheduling or clinical review), the Care Coordinator invokes `transfer_to_agent`:
1. The tool outputs a handoff signal: `{ isHandoff: true, targetAgentId: 'appointment-agent', reason: '...' }`.
2. The `AgentRunner` intercepts the handoff, preserves the authenticated user's session context and permissions, and switches `currentAgentId`.
3. An SSE event `{ event: 'handoff', data: { fromAgent, toAgent, reason } }` is emitted to the UI.
4. **Recursion Guard**: Delegation depth is tracked (`MAX_DELEGATION_DEPTH = 3`). If a delegation exceeds 3 hops, an error is thrown to prevent infinite loops.
