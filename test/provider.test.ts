import { describe, it, expect } from 'vitest';
import { getDigest, museConfigured, digestModelLabel } from '../src/lib/provider';
import { summarize } from '../src/lib/kpis';
import { weekEvents, T0 } from './fixtures';

const DAY = 86400;
const cur = summarize(weekEvents(), T0, T0 + 7 * DAY);

function mockFetchOk(body: unknown) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fn = (async (url: unknown, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as unknown as typeof fetch;
  return { fn, calls };
}

describe('digest provider routing', () => {
  it('reports muse configured only when base URL and key are both set', () => {
    expect(museConfigured({})).toBe(false);
    expect(museConfigured({ MUSE_BASE_URL: 'https://ep.example' })).toBe(false);
    expect(museConfigured({ MUSE_BASE_URL: 'https://ep.example', MUSE_API_KEY: 'k' })).toBe(true);
  });

  it('calls the OpenAI-compatible partner endpoint with the Bearer key', async () => {
    const { fn, calls } = mockFetchOk({ choices: [{ message: { content: ' digest text ' } }] });
    const r = await getDigest({ MUSE_BASE_URL: 'https://ep.example/', MUSE_API_KEY: 'secret' }, cur, null, fn);
    expect(r.digest).toBe('digest text');
    expect(r.provider).toBe('muse-endpoint');
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://ep.example/v1/chat/completions');
    const headers = calls[0].init?.headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer secret');
    const body = JSON.parse(String(calls[0].init?.body));
    expect(body.model).toBe('muse-glimmer-30b');
    expect(body.messages[0].content).toContain('1215.00 USD');
  });

  it('bounds the muse request to 1024 max tokens so a runaway decode cannot bill indefinitely', async () => {
    const { fn, calls } = mockFetchOk({ choices: [{ message: { content: 'x' } }] });
    await getDigest({ MUSE_BASE_URL: 'https://ep.example', MUSE_API_KEY: 'k' }, cur, null, fn);
    const body = JSON.parse(String(calls[0].init?.body));
    expect(body.max_tokens).toBe(1024);
  });

  it('sends reasoning_effort only when MUSE_REASONING_EFFORT is set', async () => {
    const a = mockFetchOk({ choices: [{ message: { content: 'x' } }] });
    await getDigest({ MUSE_BASE_URL: 'https://ep.example', MUSE_API_KEY: 'k' }, cur, null, a.fn);
    expect(JSON.parse(String(a.calls[0].init?.body))).not.toHaveProperty('reasoning_effort');
    const b = mockFetchOk({ choices: [{ message: { content: 'x' } }] });
    await getDigest({ MUSE_BASE_URL: 'https://ep.example', MUSE_API_KEY: 'k', MUSE_REASONING_EFFORT: 'low' }, cur, null, b.fn);
    expect(JSON.parse(String(b.calls[0].init?.body)).reasoning_effort).toBe('low');
  });

  it('honours the MUSE_MODEL_ID override', async () => {
    const { fn, calls } = mockFetchOk({ choices: [{ message: { content: 'x' } }] });
    await getDigest(
      { MUSE_BASE_URL: 'https://ep.example', MUSE_API_KEY: 'k', MUSE_MODEL_ID: 'custom-model' },
      cur, null, fn,
    );
    expect(JSON.parse(String(calls[0].init?.body)).model).toBe('custom-model');
  });

  it('surfaces endpoint errors with the status code', async () => {
    const fn = (async () => new Response('nope', { status: 401 })) as unknown as typeof fetch;
    await expect(
      getDigest({ MUSE_BASE_URL: 'https://ep.example', MUSE_API_KEY: 'bad' }, cur, null, fn),
    ).rejects.toThrow('401');
  });

  it('falls back to Workers AI when no partner endpoint is set', async () => {
    const run = async () => ({ response: ' workers ai digest ' });
    const r = await getDigest({ AI: { run } as unknown as Ai }, cur, null);
    expect(r.digest).toBe('workers ai digest');
    expect(r.provider).toBe('workers-ai');
    expect(r.model).toContain('@cf/');
  });

  it('never falls back to Workers AI when the muse endpoint fails', async () => {
    let aiCalled = false;
    const run = async () => { aiCalled = true; return { response: 'sneaky fallback' }; };
    const fn = (async () => new Response('down', { status: 500 })) as unknown as typeof fetch;
    await expect(
      getDigest({ AI: { run } as unknown as Ai, MUSE_BASE_URL: 'https://ep.example', MUSE_API_KEY: 'k' }, cur, null, fn),
    ).rejects.toThrow('500');
    expect(aiCalled).toBe(false);
  });

  it('throws when nothing is configured', async () => {
    await expect(getDigest({}, cur, null)).rejects.toThrow('no digest provider');
  });

  it('labels the active model for /health', () => {
    expect(digestModelLabel({})).toBe('@cf/meta/llama-3.1-8b-instruct');
    expect(digestModelLabel({ MUSE_BASE_URL: 'https://ep.example', MUSE_API_KEY: 'k' })).toBe('muse-glimmer-30b');
  });
});

describe('hosted Meta Model API route', () => {
  it('labels the hosted Meta route distinctly from a self-hosted endpoint', async () => {
    const hosted = mockFetchOk({ choices: [{ message: { content: 'd' } }] });
    const r1 = await getDigest({ MUSE_BASE_URL: 'https://api.meta.ai/v1', MUSE_API_KEY: 'k', MUSE_MODEL_ID: 'muse-spark-1.2' }, cur, null, hosted.fn);
    expect(r1.provider).toBe('muse-spark-meta-hosted');
    const selfHosted = mockFetchOk({ choices: [{ message: { content: 'd' } }] });
    const r2 = await getDigest({ MUSE_BASE_URL: 'https://modal.example', MUSE_API_KEY: 'k' }, cur, null, selfHosted.fn);
    expect(r2.provider).toBe('muse-endpoint');
  });

  it('refuses to send a prompt over the 4000-char input cap', async () => {
    const big = { ...cur, bySource: [{ source: 'x'.repeat(5000), grossCents: 1, refundCents: 0, disputeCents: 0, netCents: 1, charges: 1, refunds: 0, refundRate: 0 }] };
    const { fn, calls } = mockFetchOk({ choices: [{ message: { content: 'x' } }] });
    await expect(getDigest({ MUSE_BASE_URL: 'https://api.meta.ai/v1', MUSE_API_KEY: 'k' }, big, null, fn)).rejects.toThrow('input cap');
    expect(calls).toHaveLength(0); // no billable request went out
  });
});
