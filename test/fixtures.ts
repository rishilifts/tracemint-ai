import type { RevenueEvent } from '../src/lib/events';

const DAY = 86400;
export const T0 = 1761609600; // 2025-10-28T00:00:00Z

let n = 0;
export function ev(partial: Partial<RevenueEvent> & { ts: number }): RevenueEvent {
  n++;
  return {
    id: `e${n}`,
    kind: 'charge',
    amountCents: 1000,
    currency: 'usd',
    source: 'direct',
    ...partial,
  };
}

/** one week of plausible data across three sources */
export function weekEvents(): RevenueEvent[] {
  const out: RevenueEvent[] = [];
  const mk = (day: number, source: string, cents: number, kind: RevenueEvent['kind'] = 'charge') =>
    out.push(ev({ ts: T0 + day * DAY + 3600, source, amountCents: cents, kind }));
  for (let d = 0; d < 7; d++) {
    mk(d, 'newsletter', 4900);
    mk(d, 'newsletter', 4900);
    mk(d, 'twitter', 1900);
    if (d % 2 === 0) mk(d, 'direct', 9900);
  }
  mk(2, 'twitter', 1900, 'refund');
  mk(4, 'newsletter', 4900, 'refund');
  mk(5, 'direct', 9900, 'dispute');
  return out;
}
