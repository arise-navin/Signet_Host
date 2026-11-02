export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  tool_call_id?: string;
  tool_calls?: Array<{
    id?: string;
    function: {
      name: string;
      arguments: Record<string, any> | string;
    };
  }>;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, any>;
}

export interface GenerateParams {
  messages: ChatMessage[];
  tools?: any[];
  temperature?: number;
  model?: string;
  timeoutMs?: number;
}

export interface GenerateResponse {
  content: string;
  toolCalls?: ToolCall[];
  model: string;
  durationMs: number;
}

export interface HealthCheckResult {
  warning?: string;
  ok: boolean;
  serverRunning: boolean;
  models: string[];
  selectedModel: string;
  requestedModel: string;
  modelAvailable: boolean;
  error?: string;
}

export interface StructuredOutputParams<T> {
  prompt: string;
  schemaDescription: string;
  temperature?: number;
  model?: string;
  timeoutMs?: number;
}
