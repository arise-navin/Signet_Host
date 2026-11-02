import { z } from 'zod';

const tokenSchema = z.object({
  token: z.string().min(1),
  expires_in: z.number().positive(),
  claims: z.object({ exp: z.number(), tier: z.enum(['T1', 'T2', 'T3', 'T4']) }),
});

/** Obtain a fresh, short-lived workload token for each request, including after serverless cold starts. */
export async function acquireSignetToken(baseUrl: string, credential: string, signal: AbortSignal | null): Promise<z.infer<typeof tokenSchema>> {
  const url = `${baseUrl}/identity/token`;
  for (let attempt = 1; ; attempt += 1) {
    try {
      const timeout = AbortSignal.timeout(6000);
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ deployment_credential: credential }),
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      });
      if (!response.ok) throw new Error(`Signet identity POST ${url} returned HTTP ${response.status}: ${await response.text()}`);
      return tokenSchema.parse(await response.json());
    } catch (error) {
      if (attempt === 3 || signal?.aborted) throw error;
      console.warn('Signet token exchange failed; retrying', { url, attempt, error: error instanceof Error ? error.message : String(error) });
    }
  }
}

export function createSignetFetch(baseUrl: string, credential: string): typeof fetch {
  return async (input, init): Promise<Response> => {
    const identity = await acquireSignetToken(baseUrl, credential, init?.signal ?? null);
    const headers = new Headers(init?.headers);
    headers.set('authorization', `Bearer ${identity.token}`);
    return fetch(input, { ...init, headers });
  };
}
