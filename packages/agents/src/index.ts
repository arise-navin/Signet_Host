import { ToolRegistry } from './tools/ToolRegistry.js';
import { ALL_TOOLS } from './tools/implementations.js';

// Auto-register standard tools on load
const registry = ToolRegistry.getInstance();
for (const tool of ALL_TOOLS) {
  registry.registerTool(tool);
}

export * from './tools/ToolRegistry.js';
export * from './tools/ToolExecutor.js';
export * from './tools/implementations.js';
export * from './agents/definitions.js';
export * from './agents/AgentRegistry.js';
export * from './security.js';
export * from './time.js';
export * from './scheduling.js';
export * from './agents/AgentRunner.js';
export * from './agents/AgentRouter.js';

export * from './agents/appointmentSupport.js';

export * from './appointmentAccess.js';
export * from './appointmentLists.js';
export * from './appointmentHistory.js';

export * from './tickets.js';

export * from './bookingContext.js';
