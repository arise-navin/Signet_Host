import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { AuthUser, RoleType, AgentId } from '@hospital/shared';

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
  public getOllamaToolDefinitions(agentId: AgentId): any[] {
    const tools = this.getToolsForAgent(agentId);
    return tools.map((t) => {
      // Basic JSON schema generation from Zod
      const parameters = zodToJsonSchema(t.schema);
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

/**
 * Helper to generate simple JSON schema object from Zod schema
 */
function zodToJsonSchema(schema: z.ZodType<any>): Record<string, any> {
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape;
    const properties: Record<string, any> = {};
    const required: string[] = [];

    for (const [key, value] of Object.entries(shape)) {
      const original = value as z.ZodTypeAny;
      let field = original;
      while (field instanceof z.ZodOptional || field instanceof z.ZodDefault || field instanceof z.ZodNullable) {
        field = field instanceof z.ZodDefault ? field.removeDefault() : field.unwrap();
      }
      const isOptional = original.isOptional();
      if (!isOptional) {
        required.push(key);
      }

      let typeName = 'string';


      if (field instanceof z.ZodString) typeName = 'string';
      else if (field instanceof z.ZodNumber) typeName = 'number';
      else if (field instanceof z.ZodBoolean) typeName = 'boolean';
      else if (field instanceof z.ZodArray) typeName = 'array';
      else if (field instanceof z.ZodEnum) {
        typeName = 'string';
        properties[key] = { type: typeName, enum: (field as any)._def.values };
        continue;
      }

      const description = original.description ?? field.description;
      properties[key] = { type: typeName, description };
    }

    return {
      type: 'object',
      properties,
      required: required.length > 0 ? required : undefined,
    };
  }

  return { type: 'object', properties: {} };
}
