import { isBookingRecall } from '../bookingContext.js';
import { AgentId, AGENT_IDS } from '@hospital/shared';

export interface RoutingDecision { targetAgentId: AgentId; confidence: number; reason: string; }

export class AgentRouter {
  public routePrompt(prompt: string): RoutingDecision {
    if (isBookingRecall(prompt)) return { targetAgentId: AGENT_IDS.APPOINTMENT, confidence: 1, reason: 'Retrieve the exact previous booking outcome.' };
    const text = prompt.toLowerCase();
    const rules: { pattern: RegExp; targetAgentId: AgentId; reason: string }[] = [
      { pattern: /\b(support|ticket|billing|insurance|escalat\w*|speak to|staff assistance|visiting hours|visitor\w*|parking|cafeteria|hospital hours|opening hours|faq)\b/, targetAgentId: AGENT_IDS.CARE, reason: 'Hospital support, FAQ, or staff escalation request.' },
      { pattern: /\b(lab\w*|blood test|cholesterol|test report|cbc|metabolic|lipid|result\w* ready)\b/, targetAgentId: AGENT_IDS.LAB, reason: 'Laboratory test or report request.' },
      { pattern: /\b(medical (history|records?)|prescription\w*|visit summary|previous visit|last visit|clinical note\w*|vitals|diagnosis|patient profile)\b/, targetAgentId: AGENT_IDS.RECORDS, reason: 'Clinical records, visit history, or prescriptions request.' },
      { pattern: /\b(appointment\w*|book|reschedule|cancel|slots?|schedule|available doctor|cardiologist|see a doctor)\b/, targetAgentId: AGENT_IDS.APPOINTMENT, reason: 'Appointment or professional schedule request.' },
    ];
    const rule = rules.find((candidate) => candidate.pattern.test(text));
    return rule ? { targetAgentId: rule.targetAgentId, confidence: 0.95, reason: rule.reason } : { targetAgentId: AGENT_IDS.CARE, confidence: 0.3, reason: 'Ambiguous request; Care Coordinator will clarify or classify with Ollama.' };
  }

  public selectAgent(prompt: string, selectedAgent: AgentId | undefined): RoutingDecision {
    if (selectedAgent) return { targetAgentId: selectedAgent, confidence: 1, reason: 'Explicit user agent selection preserved.' };
    return this.routePrompt(prompt);
  }
}
