export type EventKind = 'charge' | 'refund' | 'dispute';

export interface RevenueEvent {
  id: string;
  /** unix seconds */
  ts: number;
  kind: EventKind;
  amountCents: number;
  currency: string;
  /** acquisition source, e.g. 'twitter', 'newsletter', 'direct' */
  source: string;
  utmCampaign?: string | null;
  customerHint?: string | null;
}

export interface EventRow {
  id: string;
  ts: number;
  kind: string;
  amount_cents: number;
  currency: string;
  source: string;
  utm_campaign: string | null;
  customer_hint: string | null;
}

export function rowToEvent(r: EventRow): RevenueEvent {
  return {
    id: r.id,
    ts: r.ts,
    kind: r.kind as EventKind,
    amountCents: r.amount_cents,
    currency: r.currency,
    source: r.source || 'direct',
    utmCampaign: r.utm_campaign,
    customerHint: r.customer_hint,
  };
}

const KINDS: EventKind[] = ['charge', 'refund', 'dispute'];

export function parseEvent(body: unknown): RevenueEvent | { error: string } {
  if (typeof body !== 'object' || body === null) return { error: 'body must be an object' };
  const b = body as Record<string, unknown>;
  if (typeof b.id !== 'string' || !b.id) return { error: 'id (string) is required' };
  if (typeof b.ts !== 'number' || !Number.isFinite(b.ts)) return { error: 'ts (unix seconds) is required' };
  if (typeof b.kind !== 'string' || !KINDS.includes(b.kind as EventKind))
    return { error: `kind must be one of ${KINDS.join(', ')}` };
  if (typeof b.amountCents !== 'number' || !Number.isInteger(b.amountCents) || b.amountCents < 0)
    return { error: 'amountCents must be a non-negative integer' };
  return {
    id: b.id,
    ts: b.ts,
    kind: b.kind as EventKind,
    amountCents: b.amountCents,
    currency: typeof b.currency === 'string' && b.currency ? b.currency.toLowerCase() : 'usd',
    source: typeof b.source === 'string' && b.source ? b.source : 'direct',
    utmCampaign: typeof b.utmCampaign === 'string' ? b.utmCampaign : null,
    customerHint: typeof b.customerHint === 'string' ? b.customerHint : null,
  };
}
