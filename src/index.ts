import { parseEvent, rowToEvent, type EventRow, type RevenueEvent } from './lib/events';
import { summarize, compare } from './lib/kpis';
import { validateDigest } from './lib/digest';
import { getDigest, digestModelLabel, digestProviderName } from './lib/provider';
import { renderDashboard } from './lib/page';

export interface Env {
  AI: Ai;
  DB: D1Database;
  /** override digest model id */
  MODEL_ID?: string;
  /** when '1', the dashboard shows a visible DEMO DATA badge */
  DEMO_MODE?: string;
  /** shared secret for POST /ingest */
  INGEST_TOKEN?: string;
  /** Muse partner endpoint (OpenAI-compatible). When both are set the digest
   *  route uses the endpoint instead of the Workers AI binding. */
  MUSE_BASE_URL?: string;
  MUSE_API_KEY?: string;
  /** override the model id sent to the partner endpoint */
  MUSE_MODEL_ID?: string;
}

const DAY = 86400;

interface StoredDigest {
  digest: string;
  model: string;
  provider: 'muse-endpoint' | 'muse-spark-meta-hosted' | 'workers-ai';
  generatedAt: string;
}

/** Read the last generated digest for a period (never calls the model). */
async function loadStoredDigest(env: Env, start: number, end: number): Promise<StoredDigest | null> {
  const row = await env.DB.prepare(
    'SELECT digest, model, provider, generated_at FROM digests WHERE period_start = ? AND period_end = ?',
  ).bind(start, end).first<{ digest: string; model: string; provider: StoredDigest['provider']; generated_at: string }>();
  return row ? { digest: row.digest, model: row.model, provider: row.provider, generatedAt: row.generated_at } : null;
}

async function storeDigest(env: Env, start: number, end: number, d: StoredDigest, grounded: boolean): Promise<void> {
  await env.DB.prepare(
    'INSERT OR REPLACE INTO digests (period_start, period_end, digest, model, provider, generated_at, grounded) VALUES (?,?,?,?,?,?,?)',
  ).bind(start, end, d.digest, d.model, d.provider, d.generatedAt, grounded ? 1 : 0).run();
}

function mixedCurrencyResponse(err: unknown, asHtml: boolean): Response | null {
  const msg = err instanceof Error ? err.message : '';
  if (!msg.startsWith('mixed currencies')) return null;
  if (asHtml) {
    return new Response(`<!doctype html><html><body style="font-family:sans-serif;max-width:640px;margin:3rem auto;padding:0 1.25rem"><h1>Cannot summarize mixed currencies</h1><p>${msg}</p></body></html>`, { status: 400, headers: { 'content-type': 'text/html; charset=utf-8' } });
  }
  return json({ error: 'mixed_currency', message: msg }, 400);
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

async function loadEvents(env: Env, since = 0): Promise<RevenueEvent[]> {
  const { results } = await env.DB.prepare(
    'SELECT * FROM events WHERE ts >= ? ORDER BY ts ASC',
  ).bind(since).all<EventRow>();
  return (results ?? []).map(rowToEvent);
}

function periodFrom(url: URL): { start: number; end: number } {
  const now = Math.floor(Date.now() / 1000);
  const days = Math.min(Math.max(parseInt(url.searchParams.get('days') ?? '7', 10) || 7, 1), 90);
  // stable window: end = next UTC midnight. A floating `end = now` meant two
  // requests seconds apart addressed different periods, so a stored digest
  // keyed by (start, end) almost never matched, and an event stamped "now"
  // could fall outside its own period (e.ts < end). Quantizing fixes both.
  const end = Math.floor(now / DAY) * DAY + DAY;
  return { start: end - days * DAY, end };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'POST' && url.pathname === '/ingest') {
      if (env.INGEST_TOKEN) {
        const auth = request.headers.get('authorization');
        if (auth !== `Bearer ${env.INGEST_TOKEN}`) return json({ error: 'unauthorized' }, 401);
      }
      const parsed = parseEvent(await request.json().catch(() => null));
      if ('error' in parsed) return json(parsed, 400);
      await env.DB.prepare(
        'INSERT OR REPLACE INTO events (id, ts, kind, amount_cents, currency, source, utm_campaign, customer_hint) VALUES (?,?,?,?,?,?,?,?)',
      ).bind(
        parsed.id, parsed.ts, parsed.kind, parsed.amountCents, parsed.currency,
        parsed.source, parsed.utmCampaign ?? null, parsed.customerHint ?? null,
      ).run();
      return json({ ok: true, id: parsed.id }, 201);
    }

    if (request.method === 'GET' && url.pathname === '/api/kpis') {
      const { start, end } = periodFrom(url);
      const span = end - start;
      const events = await loadEvents(env, start - span);
      let current, previous;
      try {
        current = summarize(events, start, end);
        previous = summarize(events, start - span, start);
      } catch (err) {
        const r = mixedCurrencyResponse(err, false);
        if (r) return r;
        throw err;
      }
      return json({ current, previous, delta: compare(current, previous) });
    }

    // Explicit digest generation. This is the ONLY route that can call the
    // model (a paid operation): POST-only, and token-gated when INGEST_TOKEN
    // is set, so refreshes, crawlers and prefetchers can never spend.
    if (request.method === 'POST' && url.pathname === '/api/digest') {
      if (env.INGEST_TOKEN) {
        const auth = request.headers.get('authorization');
        if (auth !== `Bearer ${env.INGEST_TOKEN}`) return json({ error: 'unauthorized' }, 401);
      }
      const { start, end } = periodFrom(url);
      const span = end - start;
      const events = await loadEvents(env, start - span);
      let current, previous;
      try {
        current = summarize(events, start, end);
        previous = summarize(events, start - span, start);
      } catch (err) {
        const r = mixedCurrencyResponse(err, false);
        if (r) return r;
        throw err;
      }
      const prev = previous.charges || previous.refunds ? previous : null;
      try {
        const result = await getDigest(env, current, prev);
        const unverified = validateDigest(result.digest, current, prev);
        await storeDigest(env, start, end, result, unverified.length === 0);
        return json({ ...result, grounded: unverified.length === 0, unverifiedFigures: unverified, summary: current });
      } catch (err) {
        // detail stays server-side; the public error carries no internals
        console.error('digest generation failed', err);
        return json({ error: 'ai_unavailable', message: 'digest generation failed - try again' }, 503);
      }
    }

    // Non-billable read of the last generated digest for the period.
    if (request.method === 'GET' && url.pathname === '/api/digest') {
      const { start, end } = periodFrom(url);
      const stored = await loadStoredDigest(env, start, end);
      if (!stored) return json({ error: 'no_digest', message: 'no digest generated for this period yet' }, 404);
      return json({ ...stored });
    }

    if (request.method === 'GET' && url.pathname === '/') {
      const { start, end } = periodFrom(url);
      const span = end - start;
      const events = await loadEvents(env, start - span);
      let current, previous;
      try {
        current = summarize(events, start, end);
        previous = summarize(events, start - span, start);
      } catch (err) {
        const r = mixedCurrencyResponse(err, true);
        if (r) return r;
        throw err;
      }
      // read-only: the dashboard NEVER calls the model. It shows the stored
      // digest from the last explicit generation, re-validated against the
      // current numbers (stale figures are withheld, not shown).
      let digest = null;
      let unverifiedFigures: string[] = [];
      try {
        const prev = previous.charges ? previous : null;
        digest = await loadStoredDigest(env, start, end);
        if (digest) unverifiedFigures = validateDigest(digest.digest, current, prev);
      } catch {
        digest = null;
      }
      return new Response(renderDashboard(current, compare(current, previous).netChangePct, digest, { demoMode: env.DEMO_MODE === '1', unverifiedFigures, digestAuthRequired: Boolean(env.INGEST_TOKEN) }), {
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    }

    if (request.method === 'GET' && url.pathname === '/health') {
      return new Response(
        `tracemint-ai-analyst ok - digest model: ${digestModelLabel(env)} (${digestProviderName(env)}). Endpoints: POST /ingest, GET /api/kpis, GET /api/digest`,
        { headers: { 'content-type': 'text/plain' } },
      );
    }

    return json({ error: 'not found' }, 404);
  },
};
