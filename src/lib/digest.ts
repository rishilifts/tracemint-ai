import type { Summary } from './kpis';

export interface DigestResult {
  digest: string;
  model: string;
  /** which backend produced this digest; a Workers AI result is a development
   *  fallback and must never be presented as the qualifying Muse route */
  provider: 'muse-endpoint' | 'muse-spark-meta-hosted' | 'workers-ai';
  generatedAt: string;
}

/** Default digest model. Overridable per-environment via the MODEL_ID var so a
 *  hackathon-compliant model (e.g. Muse Spark Open on a partner API) can be swapped in. */
export const DEFAULT_MODEL = '@cf/meta/llama-3.1-8b-instruct' as const;

function money(cents: number, currency: string): string {
  return `${(cents / 100).toFixed(2)} ${currency.toUpperCase()}`;
}

/** Deterministic prompt from a summary. The model is instructed to use only these
 *  numbers, but an LLM can still deviate - always run validateDigest on the output. */
export function buildDigestPrompt(current: Summary, previous: Summary | null): string {
  const lines: string[] = [
    `Period: ${new Date(current.periodStart * 1000).toISOString().slice(0, 10)} to ${new Date(current.periodEnd * 1000).toISOString().slice(0, 10)}`,
    `Gross: ${money(current.grossCents, current.currency)} across ${current.charges} charges`,
    `Refunds: ${money(current.refundCents, current.currency)} (${current.refunds} refunds, ${(current.refundRate * 100).toFixed(1)}% of charges)`,
    `Disputes: ${money(current.disputeCents, current.currency)} (${current.disputes})`,
    `Net: ${money(current.netCents, current.currency)}`,
    `Average order value: ${money(current.aovCents, current.currency)}`,
  ];
  if (current.bySource.length) {
    lines.push('By source (net), top 3 only:');
    for (const s of current.bySource.slice(0, 3)) {
      lines.push(`- ${s.source}: ${money(s.netCents, current.currency)} net, ${s.charges} charges, ${(s.refundRate * 100).toFixed(1)}% refund rate`);
    }
  }
  if (previous) {
    const pct = (cur: number, prev: number) => (prev === 0 ? 'n/a' : `${(((cur - prev) / prev) * 100).toFixed(1)}%`);
    lines.push(`Vs previous period: gross ${pct(current.grossCents, previous.grossCents)}, net ${pct(current.netCents, previous.netCents)}`);
  }
  return [
    'You are a revenue analyst writing a short weekly digest for a solo founder.',
    'Use ONLY the numbers below. Do not invent figures, trends, or causes.',
    'Write 3 short sections with these exact headings:',
    'WHAT HAPPENED - the headline numbers in plain English.',
    'WHAT CHANGED - movement vs the previous period and between sources.',
    'WHAT TO WATCH - 1-3 concrete watch-outs (e.g. a source with a high refund rate).',
    'Keep it under 120 words. No hype, no emojis.',
    '',
    'NUMBERS:',
    ...lines,
  ].join('\n');
}

/**
 * Check that every money/percent figure in the model's digest actually appears
 * in the computed summary. Returns the figures found in the digest that have no
 * matching computed value - an empty list means the digest is fully grounded.
 */
export function validateDigest(digest: string, current: Summary, previous: Summary | null): string[] {
  const known = new Set<string>();
  const addMoney = (cents: number) => {
    known.add((cents / 100).toFixed(2));
    known.add((cents / 100).toFixed(0));
  };
  addMoney(current.grossCents); addMoney(current.refundCents); addMoney(current.disputeCents);
  addMoney(current.netCents); addMoney(current.aovCents);
  for (const s of current.bySource) { addMoney(s.grossCents); addMoney(s.refundCents); addMoney(s.netCents); }
  const counts = new Set([current.charges, current.refunds, current.disputes, ...current.bySource.flatMap((s) => [s.charges, s.refunds])].map(String));
  if (previous) {
    addMoney(previous.grossCents); addMoney(previous.netCents);
    // week-over-week percentages quoted from the prompt's "Vs previous period" line
    for (const [c, p] of [[current.grossCents, previous.grossCents], [current.netCents, previous.netCents]]) {
      if (p !== 0) {
        const pct = (((c - p) / p) * 100).toFixed(1);
        known.add(pct);
        known.add(pct.replace('-', ''));
      }
    }
  }
  known.add((current.refundRate * 100).toFixed(1));
  for (const s of current.bySource) known.add((s.refundRate * 100).toFixed(1));

  const suspicious: string[] = [];
  // money-like figures: 1,234.56 / 1234.56 / 99
  for (const m of digest.matchAll(/\$?(\d[\d,]*(?:\.\d+)?)/g)) {
    const raw = m[1].replace(/,/g, '');
    if (known.has(raw) || counts.has(raw)) continue;
    const asNum = parseFloat(raw);
    // ignore small ordinals/list numbers and day counts
    if (Number.isInteger(asNum) && asNum <= 31) continue;
    // ignore calendar years quoted from the period dates (e.g. 2026)
    if (Number.isInteger(asNum) && asNum >= 1900 && asNum <= 2100) continue;
    suspicious.push(m[1]);
  }
  // percentages
  for (const m of digest.matchAll(/(\d+(?:\.\d+)?)%/g)) {
    if (!known.has(m[1])) suspicious.push(m[1] + '%');
  }
  return [...new Set(suspicious)];
}

export async function generateDigest(
  ai: Ai,
  current: Summary,
  previous: Summary | null,
  model: string = DEFAULT_MODEL,
): Promise<DigestResult> {
  const prompt = buildDigestPrompt(current, previous);
  const res = (await ai.run(model as keyof AiModels, {
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 512,
  })) as { response?: string };
  if (!res.response) throw new Error('model returned no response');
  return { digest: res.response.trim(), model, provider: 'workers-ai', generatedAt: new Date().toISOString() };
}
