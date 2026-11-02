import { AgentId, AGENT_IDS } from '@hospital/shared';
import { AgentConfig, AGENT_CONFIGS } from './definitions.js';

export class AgentRegistry {
  private static instance: AgentRegistry;
  private agents: Map<AgentId, AgentConfig> = new Map();

  constructor() {
    for (const [id, config] of Object.entries(AGENT_CONFIGS)) {
      this.agents.set(id as AgentId, config);
    }
  }

  public static getInstance(): AgentRegistry {
    if (!AgentRegistry.instance) {
      AgentRegistry.instance = new AgentRegistry();
    }
    return AgentRegistry.instance;
  }

  public getAgent(id: AgentId): AgentConfig | undefined {
    return this.agents.get(id);
  }

  public getAllAgents(): AgentConfig[] {
    return Array.from(this.agents.values());
  }

  public isValidAgentId(id: string): id is AgentId {
    return Object.values(AGENT_IDS).includes(id as AgentId);
  }
}
