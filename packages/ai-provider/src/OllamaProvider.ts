import { ollamaResponseSchema, parseToolCalls, requestOllama } from './ollamaResponse.js';
import { AIProvider } from './AIProvider.js';
import {
  ChatMessage,
  GenerateParams,
  GenerateResponse,
  HealthCheckResult,
  StructuredOutputParams,
  ToolCall,
} from './types.js';

export interface OllamaProviderOptions {
  baseUrl?: string;
  model?: string;
  requestedModel?: string;
  defaultTimeoutMs?: number;
}

export class OllamaProvider implements AIProvider {
  private baseUrl: string;
  private currentModel: string;
  private requestedModel: string;
  private defaultTimeoutMs: number;

  constructor(options: OllamaProviderOptions = {}) {
    this.baseUrl = (options.baseUrl || process.env.OLLAMA_BASE_URL || 'http://localhost:11434').replace(/\/$/, '');
    this.requestedModel = options.requestedModel || process.env.OLLAMA_REQUESTED_MODEL || 'beam:cloude';
    this.currentModel = options.model || process.env.OLLAMA_MODEL || this.requestedModel;
    this.defaultTimeoutMs = options.defaultTimeoutMs || 45000;
  }

  public getModel(): string {
    return this.currentModel;
  }

  public getRequestedModel(): string {
    return this.requestedModel;
  }

  public setModel(model: string): void {
    this.currentModel = model;
  }

  /**
   * Health check to inspect Ollama status, available models, and model availability.
   */
  public async healthCheck(): Promise<HealthCheckResult> {
    const start = Date.now();
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      const res = await fetch(`${this.baseUrl}/api/tags`, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        return {
          ok: false,
          serverRunning: true,
          models: [],
          selectedModel: this.currentModel,
          requestedModel: this.requestedModel,
          modelAvailable: false,
          error: `Ollama returned HTTP ${res.status}: ${res.statusText}`,
        };
      }

      const data = (await res.json()) as { models?: Array<{ name: string }> };
      const installedModels = (data.models || []).map((m) => m.name);

      const isRequestedAvailable = installedModels.some(
        (m) => m === this.requestedModel || m.startsWith(`${this.requestedModel}:`)
      );

      const isCurrentAvailable = installedModels.some(
        (m) => m === this.currentModel || m.startsWith(`${this.currentModel}:`)
      );

      let errorMessage: string | undefined;
      if (!isCurrentAvailable) {
        errorMessage = `Selected model '${this.currentModel}' is not installed in Ollama. Installed models: [${installedModels.join(', ')}]. Please configure or select an installed model.`;
      } else if (!isRequestedAvailable && this.requestedModel !== this.currentModel) {
        errorMessage = `Requested model '${this.requestedModel}' is not installed in Ollama. Using configured model '${this.currentModel}'. Installed models: [${installedModels.join(', ')}].`;
      }

      return {
        ok: isCurrentAvailable,
        serverRunning: true,
        models: installedModels,
        selectedModel: this.currentModel,
        requestedModel: this.requestedModel,
        modelAvailable: isCurrentAvailable,
        error: isCurrentAvailable ? undefined : errorMessage,
      };
    } catch (err: any) {
      return {
        ok: false,
        serverRunning: false,
        models: [],
        selectedModel: this.currentModel,
        requestedModel: this.requestedModel,
        modelAvailable: false,
        error: `Ollama server is unreachable at ${this.baseUrl}: ${err.message || String(err)}`,
      };
    }
  }

  /**
   * List installed models
   */
  public async listModels(): Promise<string[]> {
    const res = await fetch(`${this.baseUrl}/api/tags`);
    if (!res.ok) {
      throw new Error(`Failed to list Ollama models: HTTP ${res.status}`);
    }
    const data = (await res.json()) as { models?: Array<{ name: string }> };
    return (data.models || []).map((m) => m.name);
  }

  /**
   * Generate completion with tool calling support
   */
  public async generate(params: GenerateParams, externalSignal?: AbortSignal): Promise<GenerateResponse> {
    const start = Date.now();
    const activeModel = params.model ?? this.currentModel;
    const payload = {
      model: activeModel, messages: params.messages, stream: false,
      options: { temperature: params.temperature ?? 0.2 },
      ...(params.tools?.length ? { tools: params.tools } : {}),
    };
    const response = await requestOllama(`${this.baseUrl}/api/chat`, payload, params.timeoutMs ?? this.defaultTimeoutMs, externalSignal);
    const parsed = ollamaResponseSchema.safeParse(await response.json());
    if (!parsed.success) throw new Error(`Invalid Ollama response for model ${activeModel}: ${parsed.error.message}`);
    const toolCalls = parseToolCalls(parsed.data.message.tool_calls);
    return { content: parsed.data.message.content, toolCalls: toolCalls.length ? toolCalls : undefined, model: activeModel, durationMs: Date.now() - start };
  }

  /**
   * Stream token output and resolve final response
   */
  public async stream(
    params: GenerateParams,
    onToken: (token: string) => void,
    externalSignal?: AbortSignal
  ): Promise<GenerateResponse> {
    const start = Date.now();
    const timeoutMs = params.timeoutMs || this.defaultTimeoutMs;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    if (externalSignal) {
      externalSignal.addEventListener('abort', () => controller.abort());
    }

    try {
      const activeModel = params.model || this.currentModel;
      const payload: Record<string, any> = {
        model: activeModel,
        messages: params.messages,
        stream: true,
        options: {
          temperature: params.temperature ?? 0.2,
        },
      };

      if (params.tools && params.tools.length > 0) {
        payload.tools = params.tools;
      }

      const res = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Ollama streaming failed (HTTP ${res.status}): ${errorText}`);
      }

      if (!res.body) {
        throw new Error('Ollama response body is empty');
      }

      let fullContent = '';
      const toolCallsMap = new Map<string, ToolCall>();

      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          try {
            const chunk = JSON.parse(trimmed);
            if (chunk.error) throw new Error(`Ollama streaming failed: ${chunk.error}`);
            if (chunk.message) {
              const delta = chunk.message.content;
              if (delta) {
                fullContent += delta;
                onToken(delta);
              }

              if (Array.isArray(chunk.message.tool_calls)) {
                for (const tc of chunk.message.tool_calls) {
                  if (tc.function) {
                    let parsedArgs = tc.function.arguments;
                    if (typeof parsedArgs === 'string') {
                      try {
                        parsedArgs = JSON.parse(parsedArgs);
                      } catch (error) {
                        throw new Error(`Invalid Ollama tool arguments: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
                      }
                    }
                    const callId = tc.id || tc.function.name;
                    toolCallsMap.set(callId, {
                      id: callId,
                      name: tc.function.name,
                      arguments: parsedArgs || {},
                    });
                  }
                }
              }
            }
          } catch (error) {
            throw new Error(`Invalid Ollama stream response: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
          }
        }
      }

      const toolCalls = Array.from(toolCallsMap.values());
      return {
        content: fullContent,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        model: activeModel,
        durationMs: Date.now() - start,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Structured JSON generation conforming to a schema
   */
  public async generateStructuredOutput<T>(
    params: StructuredOutputParams<T>,
    externalSignal?: AbortSignal
  ): Promise<T> {
    const activeModel = params.model || this.currentModel;
    const systemPrompt = `You are a strict JSON data generator. Output ONLY valid JSON matching this schema: ${params.schemaDescription}. No markdown code blocks, no explanations.`;

    const response = await this.generate(
      {
        model: activeModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: params.prompt },
        ],
        temperature: params.temperature ?? 0.1,
        timeoutMs: params.timeoutMs,
      },
      externalSignal
    );

    const text = response.content.trim();
    const cleaned = text.replace(/^```json\s*/, '').replace(/```$/, '').trim();

    try {
      return JSON.parse(cleaned) as T;
    } catch (err: any) {
      throw new Error(`Failed to parse structured output from model: ${err.message}. Raw output: ${text}`, { cause: err });
    }
  }
}
