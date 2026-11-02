import { z } from 'zod';
import Groq from 'groq-sdk';
import { GroqProvider } from './GroqProvider.js';
import { HealthCheckResult } from './types.js';
import { acquireSignetToken, createSignetFetch } from './signetIdentity.js';

const gatewayHealthSchema = z.object({
  ok: z.literal(true),
  cloud_llm: z.array(z.string()),
  detectors: z.object({
    modes: z.object({ 'DET-INJ': z.string(), 'DET-JB': z.string(), 'DET-PII': z.string() }),
  }),
});

/** Translate the Groq SDK's provider prefix to Signet's chat-completions route. */
class SignetClient extends Groq {
  public override buildURL(...args: Parameters<Groq['buildURL']>): string {
    const [path, query, defaultBaseURL] = args;
    if (path !== '/openai/v1/chat/completions') {
      throw new Error(`Unsupported Signet SDK request path: ${path}`);
    }
    return super.buildURL('/chat/completions', query, defaultBaseURL);
  }
}

export interface SignetProviderOptions {
  baseUrl: string;
  deploymentCredential: string;
  model: string;
}

/** OpenAI-compatible Signet connector; gateway discovery does not imply seal approval. */
export class SignetProvider extends GroqProvider {
  public readonly baseUrl: string;
  private readonly deploymentCredential: string;

  constructor(options: SignetProviderOptions) {
    if (!options.deploymentCredential) throw new Error('SIGNET_DEPLOYMENT_CREDENTIAL is required when AI_PROVIDER=signet.');
    const baseUrl = options.baseUrl.replace(/\/+$/, '');
    const url = new URL(baseUrl);
    if (url.protocol !== 'https:' || url.pathname !== '/v1') {
      throw new Error('SIGNET_GATEWAY_URL must be an HTTPS URL ending in /v1.');
    }
    super({ apiKey: 'signet-managed', baseUrl, model: options.model, requestedModel: options.model });
    this.client = new SignetClient({ apiKey: 'signet-managed', baseURL: baseUrl, fetch: createSignetFetch(baseUrl, options.deploymentCredential) });
    this.baseUrl = baseUrl;
    this.deploymentCredential = options.deploymentCredential;
  }

  public override async listModels(): Promise<string[]> {
    return (await this.gatewayHealth()).cloud_llm;
  }

  private async gatewayHealth(): Promise<z.infer<typeof gatewayHealthSchema>> {
    const url = `${new URL(this.baseUrl).origin}/healthz`;
    for (let attempt = 1; ; attempt += 1) {
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(6000) });
        if (!response.ok) {
          throw new Error(`Signet discovery GET ${url} returned HTTP ${response.status}: ${await response.text()}`);
        }
        return gatewayHealthSchema.parse(await response.json());
      } catch (error) {
        if (attempt === 3) throw error;
        console.warn('Signet gateway discovery failed; retrying', {
          url, attempt, error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  public override async healthCheck(): Promise<HealthCheckResult> {
    const gateway = await this.gatewayHealth();
    const models = gateway.cloud_llm;
    const identity = await acquireSignetToken(this.baseUrl, this.deploymentCredential, null);
    const { claims } = identity;
    const modelAvailable = models.includes(this.getModel());
    const detectorsUnavailable = (claims.tier === 'T1' || claims.tier === 'T2')
      && Object.values(gateway.detectors.modes).some((mode) => mode === 'off');
    return {
      ok: modelAvailable && (!detectorsUnavailable || identity.detector_unavailability === 'audit'),
      serverRunning: true,
      models,
      selectedModel: this.getModel(),
      requestedModel: this.getRequestedModel(),
      modelAvailable,
      warning: detectorsUnavailable && identity.detector_unavailability === 'audit'
        ? 'Some AI misuse detectors are unavailable. The approved policy allows normal requests with rule-based checks and audit logging; unstructured misuse may go undetected.'
        : undefined,
      error: detectorsUnavailable && identity.detector_unavailability === 'hold'
        ? 'Signet is connected, but required high-risk detectors are disabled. Medical AI requests remain blocked until detectors and required approval support are deployed.'
        : modelAvailable ? undefined : `Signet does not advertise configured model '${this.getModel()}'.`,
    };
  }
}
