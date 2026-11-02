import { z } from 'zod';

// ==========================================
// ROLES & AUTH CONTEXT
// ==========================================
export type RoleType = 'PATIENT' | 'DOCTOR' | 'RECEPTIONIST' | 'ADMIN';

export interface AuthUser {
  id: string;
  email: string;
  role: RoleType;
  name: string;
  patientId?: string;
  doctorId?: string;
  mustChangePassword?: boolean;
}

// ==========================================
// AI AGENT CONSTANTS
// ==========================================
export const AGENT_IDS = {
  APPOINTMENT: 'appointment-agent',
  RECORDS: 'records-agent',
  LAB: 'lab-agent',
  CARE: 'care-agent',
} as const;

export type AgentId = typeof AGENT_IDS[keyof typeof AGENT_IDS];

export interface AgentMetadata {
  id: AgentId;
  name: string;
  description: string;
  roleDescription: string;
  allowedTools: string[];
  icon: string;
}

export const AGENT_METADATA_LIST: AgentMetadata[] = [
  {
    id: AGENT_IDS.APPOINTMENT,
    name: 'Appointment Agent',
    description: 'Finds doctors, checks schedules, books, reschedules and cancels hospital appointments.',
    roleDescription: 'Specialized in appointment scheduling, slot availability, and booking management.',
    allowedTools: [
      'get_appointments',
      'get_doctors',
      'get_available_slots',
      'book_appointment',
      'reschedule_appointment',
      'cancel_appointment',
    ],
    icon: 'Calendar',
  },
  {
    id: AGENT_IDS.RECORDS,
    name: 'Patient Records Agent',
    description: 'Retrieves authorized patient profiles, medical history, visit summaries and prescriptions.',
    roleDescription: 'Specialized in clinical records retrieval with strict patient/caregiver authorization boundaries.',
    allowedTools: [
      'get_patient_profile',
      'get_medical_history',
      'get_visit_summary',
      'get_prescriptions',
    ],
    icon: 'FileText',
  },
  {
    id: AGENT_IDS.LAB,
    name: 'Lab Report Agent',
    description: 'Queries diagnostic lab reports, explains test metrics, and initiates clinician reviews.',
    roleDescription: 'Explains synthetic lab results in plain language without diagnosing or prescribing.',
    allowedTools: [
      'get_lab_status',
      'get_lab_report',
      'get_lab_tests',
      'request_doctor_review',
    ],
    icon: 'FlaskConical',
  },
  {
    id: AGENT_IDS.CARE,
    name: 'Care Coordinator Agent',
    description: 'Answers hospital FAQs, creates support tickets, and coordinates multi-agent handoffs.',
    roleDescription: 'First-line patient advocate handling hospital navigation, support, and agent delegation.',
    allowedTools: [
      'search_hospital_faq',
      'create_support_ticket',
      'create_followup_request',
      'request_staff_assistance',
      'transfer_to_agent',
    ],
    icon: 'HeartHandshake',
  },
];

// ==========================================
// TOOL CALLING & STREAMING CONTRACTS
// ==========================================
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: z.ZodObject<any> | Record<string, any>;
  requiredRole?: RoleType[];
}

export interface ToolExecutionContext {
  authUser: AuthUser;
  conversationId?: string;
  agentId: AgentId;
  isDelegated?: boolean;
}

export interface ToolExecutionResult {
  toolName: string;
  callId: string;
  success: boolean;
  data?: any;
  error?: string;
  durationMs: number;
  statusCode?: number;
}

export const activityStepSchema = z.object({
  id: z.string(),
  toolName: z.string(),
  status: z.enum(['PLANNED', 'RUNNING', 'AWAITING_INPUT', 'SUCCEEDED', 'FAILED', 'SKIPPED']),
  message: z.string().optional(), ticketId: z.string().uuid().optional(), error: z.string().optional(),
});
export type ActivityStep = z.infer<typeof activityStepSchema>;

export const ticketReceiptSchema = z.object({
  ticketId: z.string().uuid(),
  ticketNumber: z.string().min(1),
  status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']),
});

export function sanitizeToolError(error: string): string {
  if (/prisma|postgres|SQL|connection string|password/i.test(error)) return 'The hospital service could not complete this operation. Contact hospital staff with the request reference.';
  return error.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '[internal ID]');
}

export function activityFromToolResult(result: ToolExecutionResult): ActivityStep {
  if (!result.success) return { id: result.callId, toolName: result.toolName, status: 'FAILED', error: sanitizeToolError(result.error ?? 'The tool failed without an error detail. Contact hospital staff.') };
  if (result.toolName === 'create_support_ticket') {
    const receipt = ticketReceiptSchema.safeParse(result.data);
    if (!receipt.success) return { id: result.callId, toolName: result.toolName, status: 'FAILED', error: 'Ticket creation returned no valid saved ticket receipt. Contact hospital staff.' };
    return { id: result.callId, toolName: result.toolName, status: 'SUCCEEDED', ticketId: receipt.data.ticketId };
  }
  return { id: result.callId, toolName: result.toolName, status: 'SUCCEEDED' };
}

export type SSEEvent =
  | { event: 'activity'; data: ActivityStep }
  | { event: 'token'; data: { token: string } }
  | { event: 'tool_call'; data: { toolName: string; args: any; callId: string } }
  | { event: 'tool_result'; data: ToolExecutionResult }
  | { event: 'handoff'; data: { fromAgent: AgentId; toAgent: AgentId; reason: string } }
  | { event: 'done'; data: { response: string; agentId: AgentId; conversationId: string; activities?: ActivityStep[] } }
  | { event: 'error'; data: { message: string; statusCode?: number; conversationId?: string; agentId?: AgentId; activities?: ActivityStep[] } };

// ==========================================
// TEST LAB SCENARIO TYPES
// ==========================================
export interface TestScenarioResult {
  testId: string;
  name: string;
  agent: string;
  expectedResult: string;
  actualResult: string;
  passed: boolean;
  executionTimeMs: number;
  details?: any;
}

export const supportTicketSummarySchema = z.object({
  id: z.string().uuid(),
  ticketNumber: z.string(),
  category: z.string(),
  subject: z.string(),
  description: z.string(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']),
  status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']),
  appointmentId: z.string().uuid().nullable(),
  createdAt: z.string().datetime(),
});
export const supportTicketListSchema = z.object({ tickets: z.array(supportTicketSummarySchema), total: z.number().int().nonnegative(), page: z.number().int().positive(), limit: z.number().int().positive() });
