import Groq from 'groq-sdk';
import { AIProvider } from './AIProvider.js';
import {
  ChatMessage,
  GenerateParams,
  GenerateResponse,
  HealthCheckResult,
  StructuredOutputParams,
  ToolCall,
} from './types.js';

export interface GroqProviderOptions {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  requestedModel?: string;
  defaultTimeoutMs?: number;
  reasoningEffort?: 'low' | 'medium' | 'high';
}

export class GroqProvider implements AIProvider {
  protected client: Groq;
  private currentModel: string;
  private requestedModel: string;
  private apiKey: string;
  private defaultTimeoutMs: number;
  private reasoningEffort: 'low' | 'medium' | 'high';

  constructor(options: GroqProviderOptions = {}) {
    this.apiKey = options.apiKey || process.env.GROQ_API_KEY || '';
    this.requestedModel = options.requestedModel || process.env.GROQ_REQUESTED_MODEL || 'openai/gpt-oss-120b';
    this.currentModel = options.model || process.env.GROQ_MODEL || this.requestedModel;
    this.defaultTimeoutMs = options.defaultTimeoutMs || 60000;
    this.reasoningEffort = options.reasoningEffort || (process.env.GROQ_REASONING_EFFORT as any) || 'medium';

    this.client = new Groq({
      apiKey: this.apiKey,
      baseURL: options.baseUrl || process.env.GROQ_BASE_URL || undefined,
    });
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

  public async healthCheck(): Promise<HealthCheckResult> {
    try {
      if (!this.apiKey) {
        return {
          ok: false,
          serverRunning: false,
          models: [],
          selectedModel: this.currentModel,
          requestedModel: this.requestedModel,
          modelAvailable: false,
          error: 'GROQ_API_KEY is not configured.',
        };
      }

      const list = await this.client.models.list();
      const models = (list.data || []).map((m) => m.id);
      const isAvailable = models.includes(this.currentModel);

      return {
        ok: isAvailable,
        serverRunning: true,
        models,
        selectedModel: this.currentModel,
        requestedModel: this.requestedModel,
        modelAvailable: isAvailable,
        error: isAvailable
          ? undefined
          : `Model '${this.currentModel}' is not available in Groq. Available models: [${models.join(', ')}]`,
      };
    } catch (err: any) {
      return {
        ok: false,
        serverRunning: false,
        models: [],
        selectedModel: this.currentModel,
        requestedModel: this.requestedModel,
        modelAvailable: false,
        error: `Groq API connection error: ${err.message || String(err)}`,
      };
    }
  }

  public async listModels(): Promise<string[]> {
    const list = await this.client.models.list();
    return (list.data || []).map((m) => m.id);
  }

  private formatMessages(messages: ChatMessage[]): any[] {
    const result: any[] = [];
    let lastToolCallId: string | undefined;

    for (const msg of messages) {
      if (msg.role === 'system') {
        result.push({ role: 'system', content: msg.content });
      } else if (msg.role === 'user') {
        result.push({ role: 'user', content: msg.content });
      } else if (msg.role === 'assistant') {
        const assistantMsg: any = { role: 'assistant', content: msg.content || null };
        if (msg.tool_calls && msg.tool_calls.length > 0) {
          assistantMsg.tool_calls = msg.tool_calls.map((tc, idx) => {
            const id = tc.id || `call_${idx}_${Date.now()}`;
            lastToolCallId = id;
            return {
              id,
              type: 'function',
              function: {
                name: tc.function.name,
                arguments:
                  typeof tc.function.arguments === 'string'
                    ? tc.function.arguments
                    : JSON.stringify(tc.function.arguments),
              },
            };
          });
        }
        result.push(assistantMsg);
      } else if (msg.role === 'tool') {
        result.push({
          role: 'tool',
          tool_call_id: msg.tool_call_id || lastToolCallId || `call_${Date.now()}`,
          content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
        });
      }
    }
    return result;
  }

  public async generate(params: GenerateParams, signal?: AbortSignal): Promise<GenerateResponse> {
    const start = Date.now();
    const activeModel = params.model || this.currentModel;
    const formattedMessages = this.formatMessages(params.messages);

    const isGptOss = activeModel.includes('gpt-oss') || activeModel.includes('deepseek');

    const requestPayload: any = {
      model: activeModel,
      messages: formattedMessages,
      temperature: params.temperature ?? (isGptOss ? 1 : 0.2),
      max_completion_tokens: 4096,
      top_p: 1,
    };

    if (isGptOss) {
      requestPayload.reasoning_effort = this.reasoningEffort;
    }

    if (params.tools && params.tools.length > 0) {
      requestPayload.tools = params.tools;
    }

    const completion = await this.client.chat.completions.create(requestPayload, {
      signal,
      timeout: params.timeoutMs || this.defaultTimeoutMs,
    });

    const choice = completion.choices?.[0];
    const content = choice?.message?.content || '';
    let toolCalls: ToolCall[] | undefined;

    if (choice?.message?.tool_calls && choice.message.tool_calls.length > 0) {
      toolCalls = choice.message.tool_calls.map((tc) => {
        let parsedArgs: any = {};
        try {
          parsedArgs =
            typeof tc.function.arguments === 'string'
              ? JSON.parse(tc.function.arguments)
              : tc.function.arguments;
        } catch {
          parsedArgs = {};
        }
        return {
          id: tc.id,
          name: tc.function.name,
          arguments: parsedArgs,
        };
      });
    }

    return {
      content,
      toolCalls: toolCalls && toolCalls.length > 0 ? toolCalls : undefined,
      model: activeModel,
      durationMs: Date.now() - start,
    };
  }

  public async stream(
    params: GenerateParams,
    onToken: (token: string) => void,
    signal?: AbortSignal
  ): Promise<GenerateResponse> {
    const start = Date.now();
    const activeModel = params.model || this.currentModel;
    const formattedMessages = this.formatMessages(params.messages);
    const isGptOss = activeModel.includes('gpt-oss') || activeModel.includes('deepseek');

    const requestPayload: any = {
      model: activeModel,
      messages: formattedMessages,
      temperature: params.temperature ?? (isGptOss ? 1 : 0.2),
      max_completion_tokens: 4096,
      top_p: 1,
      stream: true,
    };

    if (isGptOss) {
      requestPayload.reasoning_effort = this.reasoningEffort;
    }

    if (params.tools && params.tools.length > 0) {
      requestPayload.tools = params.tools;
    }

    const stream = (await this.client.chat.completions.create(requestPayload, {
      signal,
      timeout: params.timeoutMs || this.defaultTimeoutMs,
    })) as unknown as AsyncIterable<any>;

    let fullContent = '';
    const toolCallsMap = new Map<number, { id?: string; name?: string; arguments: string }>();

    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta;
      if (delta?.content) {
        fullContent += delta.content;
        onToken(delta.content);
      }

      if (delta?.tool_calls) {
        for (const tc of delta.tool_calls) {
          const index = tc.index ?? 0;
          const existing = toolCallsMap.get(index) || { arguments: '' };
          if (tc.id) existing.id = tc.id;
          if (tc.function?.name) existing.name = tc.function.name;
          if (tc.function?.arguments) existing.arguments += tc.function.arguments;
          toolCallsMap.set(index, existing);
        }
      }
    }

    const toolCalls: ToolCall[] = [];
    for (const [_, tc] of toolCallsMap.entries()) {
      if (tc.name) {
        let args: any = {};
        try {
          args = JSON.parse(tc.arguments || '{}');
        } catch {
          args = {};
        }
        toolCalls.push({
          id: tc.id || `call_${Date.now()}`,
          name: tc.name,
          arguments: args,
        });
      }
    }

    return {
      content: fullContent,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      model: activeModel,
      durationMs: Date.now() - start,
    };
  }

  public async generateStructuredOutput<T>(
    params: StructuredOutputParams<T>,
    signal?: AbortSignal
  ): Promise<T> {
    const activeModel = params.model || this.currentModel;
    const systemPrompt = `You are a strict JSON data generator. Output ONLY valid JSON matching this schema: ${params.schemaDescription}. No markdown code blocks, no explanations.`;

    const completion = await this.client.chat.completions.create(
      {
        model: activeModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: params.prompt },
        ],
        temperature: params.temperature ?? 0.1,
        response_format: { type: 'json_object' },
        max_completion_tokens: 2048,
      },
      {
        signal,
        timeout: params.timeoutMs || this.defaultTimeoutMs,
      }
    );

    const text = (completion.choices?.[0]?.message?.content || '').trim();
    const cleaned = text.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();

    try {
      return JSON.parse(cleaned) as T;
    } catch (err: any) {
      throw new Error(`Failed to parse structured output from model: ${err.message}. Raw output: ${text}`, {
        cause: err,
      });
    }
  }
}
