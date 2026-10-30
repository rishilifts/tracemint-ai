import { describe, it, expect } from 'vitest';
import { summarize, compare } from '../src/lib/kpis';
import { weekEvents, T0 } from './fixtures';

const DAY = 86400;

describe('summarize', () => {
  const events = weekEvents();
  const s = summarize(events, T0, T0 + 7 * DAY);

  it('computes gross, refunds, disputes and net', () => {
    // gross: 14*4900 + 7*1900 + 4*9900 = 68600 + 13300 + 39600 = 121500
    expect(s.grossCents).toBe(121500);
    expect(s.refundCents).toBe(6800);
    expect(s.disputeCents).toBe(9900);
    expect(s.netCents).toBe(121500 - 6800 - 9900);
  });

  it('counts and rates', () => {
    expect(s.charges).toBe(25);
    expect(s.refunds).toBe(2);
    expect(s.refundRate).toBeCloseTo(2 / 25);
    expect(s.aovCents).toBe(Math.round(121500 / 25));
  });

  it('ranks sources by net', () => {
    expect(s.bySource[0].source).toBe('newsletter');
    const tw = s.bySource.find((x) => x.source === 'twitter')!;
    expect(tw.netCents).toBe(7 * 1900 - 1900);
  });


  it('subtracts disputes from per-source net', () => {
    const direct = s.bySource.find((x) => x.source === 'direct')!;
    expect(direct.disputeCents).toBe(9900);
    expect(direct.netCents).toBe(4 * 9900 - 9900);
  });

  it('excludes events outside the period', () => {
    const s2 = summarize(events, T0, T0 + DAY);
    expect(s2.charges).toBe(4); // 2 newsletter + 1 twitter + 1 direct (d=0 even)
  });

  it('handles empty input', () => {
    const s3 = summarize([], T0, T0 + DAY);
    expect(s3.grossCents).toBe(0);
    expect(s3.refundRate).toBe(0);
    expect(s3.bySource).toEqual([]);
  });
});

describe('compare', () => {
  it('returns null percentage when previous is zero', () => {
    const cur = summarize(weekEvents(), T0, T0 + 7 * DAY);
    const prev = summarize([], T0 - 7 * DAY, T0);
    const d = compare(cur, prev);
    expect(d.grossChangePct).toBeNull();
  });
});

describe('mixed currencies', () => {
  it('refuses to summarize a period with more than one currency', () => {
    const ev = weekEvents();
    ev.push({ id: 'fx-1', ts: T0 + 3600, kind: 'charge', amountCents: 1000, currency: 'inr', source: 'direct' });
    expect(() => summarize(ev, T0, T0 + 86400)).toThrow(/mixed currencies/);
  });
});
