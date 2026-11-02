import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { AuthUser, RoleType, AgentId } from '@hospital/shared';
import { zodToJsonSchema, type JsonSchema7Type } from 'zod-to-json-schema';

export interface FunctionToolDefinition {
  type: 'function';
  function: { name: string; description: string; parameters: JsonSchema7Type };
}

export interface ToolContext {
  authUser: AuthUser;
  agentId: AgentId;
  conversationId?: string;
  executionId?: string;
  requestId?: string;
  traceId?: string;
  intentKey?: string;
  ticketOperationId?: string;
  permittedTools?: readonly string[];
}

export interface RegisteredTool<TArgs = any, TResult = any> {
  name: string;
  description: string;
  schema: z.ZodType<TArgs>;
  allowedRoles: RoleType[];
  allowedAgents: AgentId[];
  execute: (args: TArgs, context: ToolContext, prisma: PrismaClient) => Promise<TResult>;
}

export class ToolRegistry {
  private static instance: ToolRegistry;
  private tools: Map<string, RegisteredTool> = new Map();

  public static getInstance(): ToolRegistry {
    if (!ToolRegistry.instance) {
      ToolRegistry.instance = new ToolRegistry();
    }
    return ToolRegistry.instance;
  }

  public registerTool(tool: RegisteredTool): void {
    this.tools.set(tool.name, tool);
  }

  public getTool(name: string): RegisteredTool | undefined {
    return this.tools.get(name);
  }

  public getAllTools(): RegisteredTool[] {
    return Array.from(this.tools.values());
  }

  public getToolsForAgent(agentId: AgentId): RegisteredTool[] {
    return Array.from(this.tools.values()).filter((t) => t.allowedAgents.includes(agentId));
  }

  /**
   * Convert registered tools to Ollama / OpenAI function format
   */
  public getOllamaToolDefinitions(agentId: AgentId): FunctionToolDefinition[] {
    const tools = this.getToolsForAgent(agentId);
    return tools.map((t) => {
      const parameters = zodToJsonSchema(t.schema, { target: 'jsonSchema7', $refStrategy: 'none' });
      return {
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters,
        },
      };
    });
  }
}
