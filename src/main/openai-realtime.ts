import { createHash } from 'node:crypto';
import { z } from 'zod';
import { MODEL_ID, type RealtimeClientSecret, type TargetLanguage } from '../shared/contracts';

const CLIENT_SECRET_ENDPOINT =
  'https://api.openai.com/v1/realtime/translations/client_secrets';

const ClientSecretResponseSchema = z.object({
  value: z.string().min(1),
  expires_at: z.number().optional(),
});

export type OpenAIErrorCode =
  | 'invalid_key'
  | 'billing_required'
  | 'rate_limited'
  | 'model_unavailable'
  | 'network'
  | 'unknown';

export class OpenAIRequestError extends Error {
  constructor(public readonly code: OpenAIErrorCode) {
    super(code);
    this.name = 'OpenAIRequestError';
  }
}

function mapStatus(status: number): OpenAIErrorCode {
  if (status === 401) return 'invalid_key';
  if (status === 402) return 'billing_required';
  if (status === 403 || status === 404) return 'model_unavailable';
  if (status === 429) return 'rate_limited';
  return 'unknown';
}

export function safetyIdentifier(installationId: string): string {
  return createHash('sha256').update(installationId).digest('hex');
}

export async function createTranslationClientSecret(
  apiKey: string,
  targetLanguage: TargetLanguage,
  installationId: string,
): Promise<RealtimeClientSecret> {
  let response: Response;
  try {
    response = await fetch(CLIENT_SECRET_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'OpenAI-Safety-Identifier': safetyIdentifier(installationId),
      },
      body: JSON.stringify({
        session: {
          model: MODEL_ID,
          audio: { output: { language: targetLanguage } },
        },
      }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new OpenAIRequestError('network');
  }

  if (!response.ok) {
    throw new OpenAIRequestError(mapStatus(response.status));
  }

  try {
    const parsed = ClientSecretResponseSchema.parse(await response.json());
    return { value: parsed.value, expiresAt: parsed.expires_at };
  } catch {
    throw new OpenAIRequestError('unknown');
  }
}
