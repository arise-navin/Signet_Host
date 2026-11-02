import { z } from 'zod';
import Groq from 'groq-sdk';
import { GroqProvider } from './GroqProvider.js';
import { HealthCheckResult } from './types.js';

const gatewayHealthSchema = z.object({
  ok: z.literal(true),
  cloud_llm: z.array(z.string()),
  detectors: z.object({
    modes: z.object({ 'DET-INJ': z.string(), 'DET-JB': z.string(), 'DET-PII': z.string() }),
  }),
});

const workloadClaimsSchema = z.object({ exp: z.number(), tier: z.enum(['T1', 'T2', 'T3', 'T4']) });

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
  token: string;
  model: string;
}

/** OpenAI-compatible Signet connector; gateway discovery does not imply seal approval. */
export class SignetProvider extends GroqProvider {
  public readonly baseUrl: string;
  private readonly workloadToken: string;

  constructor(options: SignetProviderOptions) {
    if (!options.token) throw new Error('SIGNET_WORKLOAD_TOKEN is required when AI_PROVIDER=signet.');
    const baseUrl = options.baseUrl.replace(/\/+$/, '');
    const url = new URL(baseUrl);
    if (url.protocol !== 'https:' || url.pathname !== '/v1') {
      throw new Error('SIGNET_GATEWAY_URL must be an HTTPS URL ending in /v1.');
    }
    super({ apiKey: options.token, baseUrl, model: options.model, requestedModel: options.model });
    this.client = new SignetClient({ apiKey: options.token, baseURL: baseUrl });
    this.baseUrl = baseUrl;
    this.workloadToken = options.token;
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
    const claims = workloadClaimsSchema.parse(
      JSON.parse(Buffer.from(this.workloadToken.split('.')[1], 'base64url').toString('utf8'))
    );
    const modelAvailable = models.includes(this.getModel());
    const expired = claims.exp * 1000 <= Date.now();
    const detectorsUnavailable = (claims.tier === 'T1' || claims.tier === 'T2')
      && Object.values(gateway.detectors.modes).some((mode) => mode === 'off');
    return {
      ok: modelAvailable && !expired && !detectorsUnavailable,
      serverRunning: true,
      models,
      selectedModel: this.getModel(),
      requestedModel: this.getRequestedModel(),
      modelAvailable,
      error: expired
        ? 'Signet workload token expired. Exchange a new bootstrap credential and update SIGNET_WORKLOAD_TOKEN.'
        : detectorsUnavailable
          ? 'Signet holds high-risk agent calls because required detectors are unavailable. The approvals engine is not deployed.'
        : modelAvailable
          ? 'Gateway reachable; seal permissions and detector decisions are checked on each inference request.'
          : `Signet does not advertise configured model '${this.getModel()}'.`,
    };
  }
}
