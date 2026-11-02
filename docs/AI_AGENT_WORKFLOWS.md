# Hospital AI Lab — AI Agent Workflows & Routing Reference

## Overview
Hospital AI Lab deploys four specialized clinical agents designed to collaborate autonomously while maintaining strict security, authorization, and clinical scope boundaries.

---

## 1. Multi-Agent Ecosystem

```
                            ┌─────────────────────┐
                            │    User Request     │
                            └──────────┬──────────┘
                                       │
                                       ▼
                            ┌─────────────────────┐
                            │     AgentRouter     │
                            │ (Intent Evaluation) │
                            └──────────┬──────────┘
                                       │
        ┌───────────────────┬──────────┴──────────┬───────────────────┐
        ▼                   ▼                     ▼                   ▼
┌───────────────┐   ┌───────────────┐     ┌───────────────┐   ┌───────────────┐
│  Appointment  │   │Patient Records│     │  Lab Report   │   │     Care      │
│     Agent     │   │     Agent     │     │     Agent     │   │  Coordinator  │
└───────┬───────┘   └───────┬───────┘     └───────┬───────┘   └───────┬───────┘
        │                   │                     │                   │
        │           transfer_to_agent (No Self-Transfer)              │
        └───────────────────┴─────────────────────┴───────────────────┘
```

---

## 2. Agent Responsibilities & Workflows

### 2.1 Workflow 1: Appointment Scheduling & Conflict Prevention
1. **User Request**: *"Book an appointment with Dr. Sarah Mitchell for next Tuesday at 10 AM."*
2. **Routing**: `AgentRouter` classifies intent as scheduling $\rightarrow$ selects `appointment-agent`.
3. **Execution Steps**:
   - `get_doctors(name="Dr. Sarah Mitchell")` $\rightarrow$ resolves doctor UUID.
   - `validate_appointment_booking(patientId, doctorId, startTime)` $\rightarrow$ preflight check without mutation.
   - `get_available_slots(doctorId, date)` $\rightarrow$ verifies slot is in doctor's active shift.
   - `book_appointment(...)` $\rightarrow$ inserts single authoritative record or catches 409 conflict.
4. **Audit**: Complete step chain persisted in `AgentExecution` and `AgentStep`.

### 2.2 Workflow 2: Patient Records Access with Clinical Scoping
1. **User Request**: *"Show me Jack Adams's past medical history."*
2. **Routing**: `AgentRouter` classifies intent as clinical charts $\rightarrow$ selects `records-agent`.
3. **Authorization Check**:
   - Caller is checked against `DoctorPatientAssignment`.
   - If caller is assigned doctor or Jack Adams $\rightarrow$ `get_medical_history()` executes and returns diagnoses/allergies.
   - If caller is unassigned doctor $\rightarrow$ `ToolExecutor` halts execution with `denied` status.

### 2.3 Workflow 3: Lab Report Summary
1. **User Request**: *"What are my latest blood test results?"*
2. **Routing**: `AgentRouter` selects `lab-agent`.
3. **Execution Steps**:
   - `get_lab_status()` $\rightarrow$ lists completed diagnostic orders.
   - `get_lab_report(id)` $\rightarrow$ fetches verified values and reference ranges.
   - `summarize_lab_report(...)` $\rightarrow$ explains clinical significance clearly indicating normal/abnormal status without fabricating synthetic values.

### 2.4 Workflow 4: Escalation & Support Ticket Generation
1. **User Request**: *"I need help rescheduling my appointment and filing an inquiry."*
2. **Routing**: `appointment-agent` identifies support escalation $\rightarrow$ calls `transfer_to_agent("care-agent")`.
3. **Handoff Guard**:
   - Self-transfer check ensures target agent != current agent.
   - Caller session context is handed off cleanly.
4. **Ticket Creation**: `create_support_ticket(subject, description, priority)` $\rightarrow$ persists `SupportTicket` with unique tracking number and returns receipt.

---

## 3. Resilience & Local Inference Fallbacks
- **Ollama Provider**: Default integration with local Ollama (`http://localhost:11434`) using configured model (`beam:cloud`).
- **Resilience**: If the local AI inference service is temporarily offline or unreachable, the system fails gracefully with standard structured responses and preserves all completed database transactions without data corruption.
