import { describe, it, expect } from 'vitest';
import { buildDigestPrompt } from '../src/lib/digest';
import { summarize } from '../src/lib/kpis';
import { weekEvents, T0 } from './fixtures';

const DAY = 86400;

describe('buildDigestPrompt', () => {
  const cur = summarize(weekEvents(), T0, T0 + 7 * DAY);
  const prev = summarize([], T0 - 7 * DAY, T0);

  it('embeds the computed numbers, not invented ones', () => {
    const p = buildDigestPrompt(cur, prev);
    expect(p).toContain('1215.00 USD'); // gross
    expect(p).toContain('newsletter');
    expect(p).toContain('Do not invent figures');
    expect(p).toContain('WHAT HAPPENED');
    expect(p).toContain('WHAT CHANGED');
    expect(p).toContain('WHAT TO WATCH');
  });

  it('bounds the source table to the top 3 and asks for brevity', () => {
    const p = buildDigestPrompt(cur, prev);
    const sourceLines = p.split('\n').filter((l) => l.startsWith('- '));
    expect(sourceLines.length).toBeLessThanOrEqual(3);
    expect(p).toContain('under 120 words');
  });

  it('includes comparison line only when a previous period is given', () => {
    expect(buildDigestPrompt(cur, prev)).toContain('Vs previous period');
    expect(buildDigestPrompt(cur, null)).not.toContain('Vs previous period');
  });
});

describe('validateDigest', () => {
  it('accepts a digest whose figures all come from the summary', async () => {
    const { validateDigest } = await import('../src/lib/digest');
    const cur = summarize(weekEvents(), T0, T0 + 7 * DAY);
    const ok = 'WHAT HAPPENED\nGross was 1215.00 USD across 25 charges. Net: 1048.00 USD. Refund rate 8.0%.';
    expect(validateDigest(ok, cur, null)).toEqual([]);
  });
  it('flags figures the model invented', async () => {
    const { validateDigest } = await import('../src/lib/digest');
    const cur = summarize(weekEvents(), T0, T0 + 7 * DAY);
    const bad = 'Gross was 9999.99 USD and refunds jumped 42.7%.';
    const flagged = validateDigest(bad, cur, null);
    expect(flagged).toContain('9999.99');
    expect(flagged).toContain('42.7%');
  });

  it('accepts week-over-week percentages that match the computed delta', async () => {
    const { validateDigest } = await import('../src/lib/digest');
    const cur = summarize(weekEvents(), T0, T0 + 7 * DAY);
    const pct = ((cur.netCents - 110000) / 110000 * 100).toFixed(1).replace('-', '');
    const prev = { ...cur, grossCents: 130000, netCents: 110000 };
    const d = `Net was ${(cur.netCents / 100).toFixed(2)} USD, down ${pct}% vs the previous period.`;
    expect(validateDigest(d, cur, prev)).toEqual([]);
    const flagged = validateDigest('Net moved 9.9% vs the previous period.', cur, prev);
    expect(flagged).toContain('9.9%');
  });
});
