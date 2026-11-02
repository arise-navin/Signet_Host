import { z } from 'zod';
import { ToolCall } from './types.js';
import { randomUUID } from 'node:crypto';

const argumentsSchema = z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]));
export const ollamaResponseSchema = z.object({
  message: z.object({
    content: z.string(),
    tool_calls: z.array(z.object({
      id: z.string().optional(),
      function: z.object({ name: z.string().min(1), arguments: z.union([argumentsSchema, z.string()]) }),
    })).optional(),
  }),
});

export function parseToolCalls(value: z.infer<typeof ollamaResponseSchema>['message']['tool_calls']): ToolCall[] {
  return (value ?? []).map((call) => ({
    id: call.id ?? `call_${randomUUID()}`,
    name: call.function.name,
    arguments: typeof call.function.arguments === 'string' ? argumentsSchema.parse(JSON.parse(call.function.arguments)) : call.function.arguments,
  }));
}

/** Retry only transient transport failures and 429/5xx; never substitute models. */
export async function requestOllama(url: string, payload: { model: string }, timeoutMs: number, externalSignal: AbortSignal | undefined): Promise<Response> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    const timeout = AbortSignal.timeout(timeoutMs);
    const signal = externalSignal ? AbortSignal.any([timeout, externalSignal]) : timeout;
    try {
      const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal });
      if (response.ok) return response;
      const body = await response.text();
      const error = Object.assign(new Error(`Ollama request failed: POST ${url}, model=${payload.model}, HTTP ${response.status}, response: ${body}`), { statusCode: 502, retryable: response.status === 429 || response.status >= 500 });
      throw error;
    } catch (error) {
      if (externalSignal?.aborted) throw error;
      const retryable = error instanceof TypeError || (error instanceof Error && 'retryable' in error && error.retryable === true);
      if (!retryable || attempt === 2) throw Object.assign(new Error(`Ollama is unavailable or returned an invalid response at ${url}, model=${payload.model}, timeoutMs=${timeoutMs}: ${error instanceof Error ? error.message : String(error)}. Check Ollama and the configured model.`, { cause: error }), { statusCode: 502 });
      console.warn(JSON.stringify({ service: 'ollama', url, model: payload.model, attempt, timeoutMs, error: error instanceof Error ? error.message : String(error) }));
      await new Promise<void>((resolve) => setTimeout(resolve, 250 * attempt));
    }
  }
  throw new Error('Ollama request attempts exhausted.');
}
