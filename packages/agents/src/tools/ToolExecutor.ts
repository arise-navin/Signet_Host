import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { ToolExecutionResult, ticketReceiptSchema } from '@hospital/shared';
import { ToolRegistry, ToolContext } from './ToolRegistry.js';

export class ToolExecutor {
  private registry: ToolRegistry;

  constructor(registry?: ToolRegistry) {
    this.registry = registry || ToolRegistry.getInstance();
  }

  /**
   * Centralized execution for all tools with validation, authorization, and logging.
   */
  public async executeTool(
    toolName: string,
    rawArgs: any,
    context: ToolContext,
    prisma: PrismaClient,
    callId: string = `call_${Date.now()}`
  ): Promise<ToolExecutionResult> {
    const start = Date.now();
    const tool = this.registry.getTool(toolName);

    // 1. Tool existence check
    if (!tool) {
      const durationMs = Date.now() - start;
      const errorMsg = `Tool '${toolName}' is not recognized in the hospital tool registry.`;
      await this.logExecution(toolName, rawArgs, null, false, errorMsg, durationMs, context, prisma);
      return {
        toolName,
        callId,
        success: false,
        error: errorMsg,
        statusCode: 400,
        durationMs,
      };
    }

    // 2. Agent permission check (enforce agent boundary)
    if (!tool.allowedAgents.includes(context.agentId) || (context.permittedTools && !context.permittedTools.includes(toolName))) {
      const durationMs = Date.now() - start;
      const errorMsg = `Authorization Denied: Agent '${context.agentId}' is not permitted to execute tool '${toolName}'.`;
      await this.logExecution(toolName, rawArgs, null, false, errorMsg, durationMs, context, prisma);
      return {
        toolName,
        callId,
        success: false,
        error: errorMsg,
        statusCode: 403,
        durationMs,
      };
    }

    // 3. User role permission check (enforce RBAC boundary)
    if (!tool.allowedRoles.includes(context.authUser.role)) {
      const durationMs = Date.now() - start;
      const errorMsg = `Permission Denied: User role '${context.authUser.role}' does not have privileges to invoke '${toolName}'.`;
      await this.logExecution(toolName, rawArgs, null, false, errorMsg, durationMs, context, prisma);
      return {
        toolName,
        callId,
        success: false,
        error: errorMsg,
        statusCode: 403,
        durationMs,
      };
    }

    // 4. Validate input arguments against Zod schema
    const parseResult = tool.schema.safeParse(rawArgs);
    if (!parseResult.success) {
      const durationMs = Date.now() - start;
      const errorMsg = `Invalid tool arguments for '${toolName}': ${parseResult.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')}`;
      await this.logExecution(toolName, rawArgs, null, false, errorMsg, durationMs, context, prisma);
      return {
        toolName,
        callId,
        success: false,
        error: errorMsg,
        statusCode: 400,
        durationMs,
      };
    }

    // 5. Execute tool within transactional/error boundary
    try {
      const result = await tool.execute(parseResult.data, context, prisma);
      if (toolName === 'create_support_ticket') ticketReceiptSchema.parse(result);
      const durationMs = Date.now() - start;

      await this.logExecution(toolName, parseResult.data, result, true, undefined, durationMs, context, prisma);

      return {
        toolName,
        callId,
        success: true,
        data: result,
        durationMs,
      };
    } catch (err: any) {
      const durationMs = Date.now() - start;
      const bookingConflict = (toolName === 'book_appointment' || toolName === 'reschedule_appointment') && err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
      const errorMsg = bookingConflict ? 'This appointment conflicts with an existing active doctor or patient booking. Choose another available time.' : err.message || String(err);

      await this.logExecution(toolName, parseResult.data, null, false, errorMsg, durationMs, context, prisma);

      return {
        toolName,
        callId,
        success: false,
        error: errorMsg,
        statusCode: bookingConflict ? 409 : typeof err.statusCode === 'number' ? err.statusCode : 500,
        durationMs,
      };
    }
  }

  private async logExecution(
    toolName: string,
    args: any,
    result: any,
    success: boolean,
    error: string | undefined,
    durationMs: number,
    context: ToolContext,
    prisma: PrismaClient
  ): Promise<void> {
    console.info(JSON.stringify({
      requestId: context.traceId ?? context.requestId ?? context.executionId ?? randomUUID(),
      agentId: context.agentId, toolName,
      authorization: success ? 'allowed' : error?.includes('403') || error?.includes('Denied') ? 'denied' : 'validated',
      status: success ? 'success' : 'failed', durationMs,
      resultMetadata: { kind: Array.isArray(result) ? 'list' : result === null ? 'empty' : typeof result, count: Array.isArray(result) ? result.length : undefined },
    }));
    if (context.executionId) {
      await prisma.toolExecution.create({
        data: { executionId: context.executionId, agentId: context.agentId, toolName, arguments: JSON.stringify(args ?? {}), result: result ? JSON.stringify(result) : null, success, error: error ?? null, durationMs },
      });
    }
  }
}
