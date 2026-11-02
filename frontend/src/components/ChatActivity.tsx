import { ActivityStep } from '@hospital/shared';

const activityNames: Readonly<Record<string, string>> = {
  create_support_ticket: 'Create support ticket', transfer_to_agent: 'Connect with a specialist',
  get_support_ticket: 'View support ticket', list_my_support_tickets: 'View my support tickets',
  list_authorized_patients: 'Find assigned patients',
  get_appointments: 'View appointments', get_doctors: 'Find doctors', get_available_slots: 'Check available times',
  validate_appointment_booking: 'Verify booking permissions and availability', get_booking_attempt: 'View requested booking outcome',
  book_appointment: 'Book an appointment', reschedule_appointment: 'Change appointment time', cancel_appointment: 'Cancel an appointment',
  get_patient_profile: 'View patient details', get_medical_history: 'View medical history', get_visit_summary: 'View previous visits',
  get_prescriptions: 'View prescriptions', get_lab_status: 'Check lab test status', get_lab_report: 'View lab report',
  get_lab_tests: 'View lab tests', request_doctor_review: 'Ask a doctor to review', search_hospital_faq: 'Find hospital information',
  create_followup_request: 'Request a follow-up', request_staff_assistance: 'Ask hospital staff for help',
};

const statusLabels: Readonly<Record<ActivityStep['status'], string>> = {
  PLANNED: 'Planned', RUNNING: 'Running', AWAITING_INPUT: 'Awaiting user input', SUCCEEDED: 'Succeeded', FAILED: 'Failed', SKIPPED: 'Skipped',
};

export function ChatActivity({ steps }: { steps: ActivityStep[] }): React.ReactElement {
  return <div className="mt-3 pt-2 border-t border-slate-200/60 space-y-1.5" data-testid="chat-activities">
    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Steps taken</p>
    {steps.map((step) => <div key={step.id} data-testid={`activity-${step.toolName}`} data-status={step.status} className="p-2 rounded-lg bg-white border border-slate-200 text-[11px]">
      <div className="flex items-center justify-between gap-3">
        <span className="text-blue-600 font-medium">{activityNames[step.toolName] ?? step.toolName.replace(/_/g, ' ')}</span>
        <span className={step.status === 'SUCCEEDED' ? 'text-emerald-700' : step.status === 'FAILED' ? 'text-rose-700' : 'text-slate-600'}>
          {step.status === 'AWAITING_INPUT' && step.message ? step.message : statusLabels[step.status]}
        </span>
      </div>
      {step.status === 'SUCCEEDED' && step.ticketId && <p className="mt-1 break-all">Ticket ID: <code data-testid="support-ticket-id">{step.ticketId}</code></p>}
      {step.status === 'FAILED' && step.error && <p className="mt-1 text-rose-700">Reason: {step.error}</p>}
      {step.status === 'SKIPPED' && step.message && <p className="mt-1 text-slate-500">{step.message}</p>}
    </div>)}
  </div>;
}
