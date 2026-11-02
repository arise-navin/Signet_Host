import {
  GenerateParams,
  GenerateResponse,
  HealthCheckResult,
  StructuredOutputParams,
} from './types.js';

export interface AIProvider {
  /**
   * Check connection, list installed models, verify current model configuration
   */
  healthCheck(): Promise<HealthCheckResult>;

  /**
   * List installed models from the underlying provider
   */
  listModels(): Promise<string[]>;

  /**
   * Get the currently active model identifier
   */
  getModel(): string;

  /**
   * Switch the active model
   */
  setModel(model: string): void;

  /**
   * Generate completion with optional tool calls
   */
  generate(params: GenerateParams, signal?: AbortSignal): Promise<GenerateResponse>;

  /**
   * Stream token output and resolve full response including tool calls
   */
  stream(
    params: GenerateParams,
    onToken: (token: string) => void,
    signal?: AbortSignal
  ): Promise<GenerateResponse>;

  /**
   * Generate structured JSON output conforming to a schema
   */
  generateStructuredOutput<T>(
    params: StructuredOutputParams<T>,
    signal?: AbortSignal
  ): Promise<T>;
}
