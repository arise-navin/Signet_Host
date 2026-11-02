# Hospital AI Application — API Reference

Base URL: `http://localhost:3001` (Backend) / `http://localhost:5173/api` (Vite Proxy)

---

## Authentication & Headers

The application uses session identity resolution based on:
1. `x-demo-user-id`: UUID of the authenticated demo user.
2. `Authorization: Bearer <token>`: Bearer token header.
3. Query param `userId`: Used by EventSource SSE connections.

If no user header is provided, the backend safely defaults to `patient1@example.com` to enable immediate demo evaluation.

---

## 1. Health & Status

### `GET /api/health`
Returns system status for backend, database, and Ollama server.
**Response (200 OK)**:
```json
{
  "status": "ok",
  "timestamp": "2026-10-26T06:32:07.525Z",
  "services": {
    "backend": { "status": "up", "uptime": 64.5 },
    "database": { "status": "connected" },
    "ollama": {
      "status": "ready",
      "serverRunning": true,
      "activeModel": "beam:cloud",
      "requestedModel": "beam:cloude",
      "modelAvailable": true,
      "installedModels": ["beam:cloud", "deepseek-v4.1-flash:cloud", "gpt-oss:120b-cloud"]
    }
  }
}
```

---

## 2. Authentication & Demo Personas

### `GET /api/auth/demo-users`
Lists available demo personas across Patient, Doctor, Receptionist, and Admin roles.

### `POST /api/auth/switch`
Switches active demo user session.
**Payload**:
```json
{ "userId": "uuid-here" }
```

---

## 3. Dashboard

### `GET /api/dashboard/stats`
Returns live metrics and activities calculated from PostgreSQL.
**Response (200 OK)**:
```json
{
  "metrics": {
    "totalPatients": 50,
    "totalDoctors": 10,
    "todayAppointments": 4,
    "totalAppointments": 100,
    "activeTickets": 13
  },
  "agents": [...],
  "recentActivities": [...],
  "recentAppointments": [...]
}
```

---

## 4. Patients Directory

### `GET /api/patients`
Query params: `search`, `page`, `limit`.
- Returns paginated patient directory.
- If caller role is `PATIENT`, results are strictly filtered to the caller's own record.

### `GET /api/patients/:id`
Returns comprehensive patient profile:
- Demographics, MRN, allergies, chronic conditions.
- Appointment history.
- Active prescriptions.
- Authorized medical records and lab reports (Blocked for `RECEPTIONIST` role with `clinicalAccessDenied: true`).

---

## 5. Doctors & Availability

### `GET /api/doctors`
Query params: `department`, `search`.
Returns list of doctors, department codes, specialization, consultation fees, and recurring weekly schedules.

### `GET /api/doctors/:id/slots?date=YYYY-MM-DD`
Calculates real unbooked 30-minute appointment slots for the doctor on the specified date.

---

## 6. Appointments

### `GET /api/appointments`
Query params: `status`, `patientId`, `doctorId`, `page`, `limit`.

### `POST /api/appointments/book`
Books an appointment with double-booking prevention.
**Payload**:
```json
{
  "doctorId": "uuid",
  "startTime": "2026-11-01T10:00:00.000Z",
  "reason": "Cardiology consult",
  "patientId": "uuid" // Optional for patient caller (auto-resolved)
}
```

### `POST /api/appointments/:id/reschedule`
**Payload**:
```json
{ "newStartTime": "2026-11-02T11:00:00.000Z" }
```

### `POST /api/appointments/:id/cancel`
**Payload**:
```json
{ "reason": "Conflict in schedule" }
```

---

## 7. AI Agent Chat & SSE Streaming

### `POST /api/chat/stream`
Streams AI responses and emits tool execution events using Server-Sent Events (SSE).

**Headers**:
- `Content-Type: application/json`
- `x-demo-user-id: <uuid>`

**Payload**:
```json
{
  "prompt": "Book an appointment with a cardiologist tomorrow.",
  "agentId": "appointment-agent",
  "conversationId": "optional-uuid"
}
```

**Streamed Event Types**:
1. `event: tool_call`
   ```json
   data: {"toolName": "get_doctors", "args": {"department": "Cardiology"}, "callId": "call_123"}
   ```
2. `event: tool_result`
   ```json
   data: {"toolName": "get_doctors", "callId": "call_123", "success": true, "durationMs": 15, "data": [...]}
   ```
3. `event: handoff`
   ```json
   data: {"fromAgent": "care-agent", "toAgent": "appointment-agent", "reason": "Patient requested booking"}
   ```
4. `event: token`
   ```json
   data: {"token": "Certainly,"}
   ```
5. `event: done`
   ```json
   data: {"response": "Your appointment is confirmed...", "agentId": "appointment-agent", "conversationId": "uuid"}
   ```
6. `event: error`
   ```json
   data: {"message": "Error description"}
   ```

---

## 8. Settings & Test Lab

### `GET /api/settings/ollama`
Returns Ollama connection state, active model, and installed models.

### `POST /api/settings/ollama/model`
Switches active model.
**Payload**:
```json
{ "model": "beam:cloud" }
```

### `POST /api/settings/ollama/test`
Runs a live inference benchmark on the active model.

### `GET /api/test-lab/run-all`
Runs the complete TEST-001 through TEST-016 automated test suite.

### `POST /api/test-lab/run/:testId`
Runs an individual test scenario.
