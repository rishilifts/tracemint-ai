import { describe, expect, it } from 'vitest';
import { summarize } from '../src/lib/kpis';
import { buildDigestPrompt, validateDigest } from '../src/lib/digest';
import { weekEvents, T0 } from './fixtures';

/**
 * Opt-in LIVE runtime test of the AI digest against Meta's open-weights
 * Llama 3.3 70B hosted on Cloudflare Workers AI (free tier, OpenAI-compatible).
 * Skipped unless CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID are set.
 * Uses the same prompt + grounding validation as the production path;
 * only the hosting endpoint differs. (GitHub Models, used in early
 * development, was retired on 2026-07-30.)
 */
const token = process.env.CLOUDFLARE_API_TOKEN;
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

describe.skipIf(!token || !accountId)('live Llama digest (Cloudflare Workers AI)', () => {
  it('writes a grounded digest from real computed KPIs', async () => {
    const week = 7 * 24 * 3600;
    const current = summarize(weekEvents(), T0, T0 + week);
    const previous = summarize([], T0 - week, T0);
    const prompt = buildDigestPrompt(current, previous);

    const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1/chat/completions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 512,
        temperature: 0.3,
      }),
    });
    if (!res.ok) throw new Error(`Workers AI ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const digest = data.choices?.[0]?.message?.content?.trim() ?? '';
    console.log('--- LIVE DIGEST (' + MODEL + ' via Cloudflare Workers AI) ---\n' + digest + '\n---');

    expect(digest.length).toBeGreaterThan(80);
    expect(digest).toContain('WHAT HAPPENED');
    const ungrounded = validateDigest(digest, current, previous);
    console.log('ungrounded figures:', JSON.stringify(ungrounded));
    expect(ungrounded).toEqual([]);
  }, 60_000);
});
