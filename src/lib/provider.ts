import type { Summary } from './kpis';
import { generateDigest, DEFAULT_MODEL, type DigestResult } from './digest';
import { generateDigestMuse, DEFAULT_MUSE_MODEL, museProviderLabel } from './muse';

export interface DigestEnv {
  AI?: Ai;
  MODEL_ID?: string;
  MUSE_BASE_URL?: string;
  MUSE_API_KEY?: string;
  MUSE_MODEL_ID?: string;
  /** optional reasoning effort for the Muse endpoint (e.g. "low"); sent as the
   *  documented reasoning_effort request parameter only when set */
  MUSE_REASONING_EFFORT?: string;
}

/** A partner endpoint is used only when both its URL and key are present. */
export function museConfigured(env: DigestEnv): boolean {
  return Boolean(env.MUSE_BASE_URL && env.MUSE_API_KEY);
}

/** Which backend would serve the digest right now. */
export function digestProviderName(env: DigestEnv): 'muse-endpoint' | 'muse-spark-meta-hosted' | 'workers-ai' {
  return museConfigured(env) ? museProviderLabel(env.MUSE_BASE_URL!) : 'workers-ai';
}

/** Model label for /health and dashboards. */
export function digestModelLabel(env: DigestEnv): string {
  return museConfigured(env) ? env.MUSE_MODEL_ID ?? DEFAULT_MUSE_MODEL : env.MODEL_ID ?? DEFAULT_MODEL;
}

/**
 * Route digest generation: the Muse partner endpoint when configured,
 * otherwise the Workers AI binding. fetchImpl is injectable for tests.
 */
export async function getDigest(
  env: DigestEnv,
  current: Summary,
  previous: Summary | null,
  fetchImpl: typeof fetch = fetch,
): Promise<DigestResult> {
  if (museConfigured(env)) {
    return generateDigestMuse(
      env.MUSE_BASE_URL!,
      env.MUSE_API_KEY!,
      current,
      previous,
      env.MUSE_MODEL_ID ?? DEFAULT_MUSE_MODEL,
      fetchImpl,
      env.MUSE_REASONING_EFFORT,
    );
  }
  if (!env.AI) throw new Error('no digest provider configured');
  return generateDigest(env.AI, current, previous, env.MODEL_ID ?? DEFAULT_MODEL);
}
