import type { Summary } from './kpis';
import { buildDigestPrompt, type DigestResult } from './digest';

/**
 * OpenAI-compatible client for the hackathon model route (Muse).
 * Works against any endpoint speaking /v1/chat/completions with a Bearer key.
 * Verified 30 Oct against a self-hosted Muse Glimmer 30B GGUF (community
 * quant by unsloth) served by llama.cpp on Modal CPU: unauthenticated
 * requests got 401, a keyed request returned a complete grounded digest.
 *
 * Wired via env: MUSE_BASE_URL + MUSE_API_KEY (+ optional MUSE_MODEL_ID).
 * Baseten's hosted route is closed (credits application not selected), so a
 * self-hosted endpoint is the current target.
 */
export const DEFAULT_MUSE_MODEL = 'muse-glimmer-30b';

/** Display label: hosted Meta Model API (Muse Spark) vs self-hosted endpoint (Muse Glimmer). */
export function museProviderLabel(baseUrl: string): 'muse-spark-meta-hosted' | 'muse-endpoint' {
  return baseUrl.includes('api.meta.ai') ? 'muse-spark-meta-hosted' : 'muse-endpoint';
}

/** Hard prompt-size cap (~4 chars/token => <= ~1100 tokens): bounds worst-case
 *  input billing per call. The real digest prompt is ~700 chars. */
export const MUSE_MAX_PROMPT_CHARS = 4000;

export async function generateDigestMuse(
  baseUrl: string,
  apiKey: string,
  current: Summary,
  previous: Summary | null,
  model: string = DEFAULT_MUSE_MODEL,
  fetchImpl: typeof fetch = fetch,
  reasoningEffort?: string,
): Promise<DigestResult> {
  const prompt = buildDigestPrompt(current, previous);
  if (prompt.length > MUSE_MAX_PROMPT_CHARS) {
    throw new Error(`digest prompt ${prompt.length} chars exceeds ${MUSE_MAX_PROMPT_CHARS}-char input cap`);
  }
  const res = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/v1/chat/completions`, {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      // Bounded on purpose: the verified complete digest was 473 tokens and the
      // prompt demands <200 words. Hosted Muse Spark also spends reasoning tokens
      // from the same budget (verified 30 Oct: a 16-token cap returned 14 reasoning
      // tokens and null content), so 1024 caps worst-case output billing
      // (~$0.0044 at standard-tier $4.25/1M) while leaving room for reasoning + digest.
      max_tokens: 1024,
      temperature: 0.3,
      // reasoning_effort is a documented Chat Completions parameter (Meta dev
      // docs; llama.cpp >= b10434 forwards it to the model's chat template,
      // which renders "Reasoning strength: <level>"). Sent only when set via
      // MUSE_REASONING_EFFORT so behavior is unchanged until verified live.
      ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
    }),
  });
  if (!res.ok) throw new Error(`Muse endpoint ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error(`Muse endpoint returned no content; raw=${JSON.stringify(data).slice(0, 400)}`);
  return { digest: text.trim(), model, provider: museProviderLabel(baseUrl), generatedAt: new Date().toISOString() };
}
