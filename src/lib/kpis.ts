import type { RevenueEvent } from './events';

export interface SourceBreakdown {
  source: string;
  grossCents: number;
  refundCents: number;
  disputeCents: number;
  netCents: number;
  charges: number;
  refunds: number;
  refundRate: number;
}

export interface DayNet {
  day: string; // YYYY-MM-DD (UTC)
  netCents: number;
}

export interface Summary {
  periodStart: number;
  periodEnd: number;
  currency: string;
  grossCents: number;
  refundCents: number;
  disputeCents: number;
  netCents: number;
  charges: number;
  refunds: number;
  disputes: number;
  refundRate: number; // refunds / charges (count-based)
  aovCents: number; // average order value over charges
  bySource: SourceBreakdown[];
  netByDay: DayNet[];
}

export function summarize(events: RevenueEvent[], periodStart: number, periodEnd: number): Summary {
  const inPeriod = events.filter((e) => e.ts >= periodStart && e.ts < periodEnd);
  const currencies = [...new Set(inPeriod.map((e) => e.currency))];
  if (currencies.length > 1) {
    throw new Error(`mixed currencies in one period (${currencies.join(', ')}): amounts would be mislabeled - run one currency at a time`);
  }
  const currency = inPeriod[0]?.currency ?? 'usd';

  let gross = 0, refund = 0, dispute = 0, charges = 0, refunds = 0, disputes = 0;
  const bySource = new Map<string, SourceBreakdown>();
  const byDay = new Map<string, number>();

  for (const e of inPeriod) {
    const day = new Date(e.ts * 1000).toISOString().slice(0, 10);
    const sign = e.kind === 'charge' ? 1 : -1;
    byDay.set(day, (byDay.get(day) ?? 0) + sign * e.amountCents);

    let s = bySource.get(e.source);
    if (!s) {
      s = { source: e.source, grossCents: 0, refundCents: 0, disputeCents: 0, netCents: 0, charges: 0, refunds: 0, refundRate: 0 };
      bySource.set(e.source, s);
    }
    if (e.kind === 'charge') {
      gross += e.amountCents; charges++;
      s.grossCents += e.amountCents; s.charges++;
    } else if (e.kind === 'refund') {
      refund += e.amountCents; refunds++;
      s.refundCents += e.amountCents; s.refunds++;
    } else {
      dispute += e.amountCents; disputes++;
      s.disputeCents += e.amountCents;
    }
  }

  const sources = [...bySource.values()]
    .map((s) => ({ ...s, netCents: s.grossCents - s.refundCents - s.disputeCents, refundRate: s.charges ? s.refunds / s.charges : 0 }))
    .sort((a, b) => b.netCents - a.netCents);

  const netByDay = [...byDay.entries()].map(([day, netCents]) => ({ day, netCents })).sort((a, b) => (a.day < b.day ? -1 : 1));

  return {
    periodStart,
    periodEnd,
    currency,
    grossCents: gross,
    refundCents: refund,
    disputeCents: dispute,
    netCents: gross - refund - dispute,
    charges,
    refunds,
    disputes,
    refundRate: charges ? refunds / charges : 0,
    aovCents: charges ? Math.round(gross / charges) : 0,
    bySource: sources,
    netByDay,
  };
}

/** Week-over-week style delta between two summaries, as percentages (null when base is 0). */
export function compare(current: Summary, previous: Summary) {
  const pct = (cur: number, prev: number) => (prev === 0 ? null : Math.round(((cur - prev) / prev) * 1000) / 10);
  return {
    grossChangePct: pct(current.grossCents, previous.grossCents),
    netChangePct: pct(current.netCents, previous.netCents),
    refundRateDeltaPts:
      Math.round((current.refundRate - previous.refundRate) * 1000) / 10,
  };
}
