import { describe, it, expect } from 'vitest';
import { renderDashboard } from '../src/lib/page';
import { summarize } from '../src/lib/kpis';
import { weekEvents, T0 } from './fixtures';

const DAY = 86400;

/** the server-rendered digest section only (excludes the client-side script,
 *  which legitimately mentions both states for its inline rendering) */
function digestSection(html: string): string {
  const m = html.match(/<section class="digest">[\s\S]*?<\/section>/);
  return m ? m[0] : '';
}

describe('renderDashboard demo labeling', () => {
  const s2 = summarize(weekEvents(), T0, T0 + 7 * DAY);
  it('shows DEMO DATA badge only in demo mode', () => {
    expect(renderDashboard(s2, null, null, { demoMode: true })).toContain('DEMO DATA');
    expect(renderDashboard(s2, null, null)).not.toContain('DEMO DATA');
  });
  it('digest section shows model provenance when present', () => {
    const h = renderDashboard(s2, null, { digest: 'x', model: 'm-1', provider: 'workers-ai', generatedAt: 't' });
    expect(h).toContain('written by m-1');
  });
  it('withholds a digest whose figures fail verification, with a visible warning', () => {
    const h = digestSection(renderDashboard(s2, null, { digest: 'secret wrong numbers', model: 'm-1', provider: 'muse-endpoint', generatedAt: 't' }, { unverifiedFigures: ['920', '5.3%'] }));
    expect(h).not.toContain('secret wrong numbers');
    expect(h).not.toContain('from the numbers above');
    expect(h).toContain('Digest withheld');
    expect(h).toContain('920, 5.3%');
    expect(h).toContain('written by m-1');
  });
  it('renders a grounded digest with the from-the-numbers provenance line', () => {
    const h = digestSection(renderDashboard(s2, null, { digest: 'ok text', model: 'm-1', provider: 'muse-endpoint', generatedAt: 't' }, { unverifiedFigures: [] }));
    expect(h).toContain('ok text');
    expect(h).toContain('from the numbers above');
    expect(h).not.toContain('Digest withheld');
  });
});

describe('renderDashboard', () => {
  const s = summarize(weekEvents(), T0, T0 + 7 * DAY);
  const html = renderDashboard(s, 12.5, { digest: 'WHAT HAPPENED\n<script>alert(1)</script>', model: 'm', provider: 'workers-ai', generatedAt: 'now' });
  it('shows money and sources', () => {
    expect(html).toContain('1215.00 USD');
    expect(html).toContain('newsletter');
    expect(html).toContain('+12.5% vs previous');
  });
  it('escapes digest html', () => {
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });
  it('handles no digest and no events', () => {
    const empty = renderDashboard(summarize([], T0, T0 + DAY), null, null);
    expect(empty).toContain('no events in this period');
    expect(empty).toContain('AI summary offline');
  });
  it('shows a token field on the generate form only when ingest auth is required', () => {
    const withAuth = renderDashboard(summarize([], T0, T0 + DAY), null, null, { digestAuthRequired: true });
    expect(withAuth).toContain('id="tok"');
    const noAuth = renderDashboard(summarize([], T0, T0 + DAY), null, null);
    expect(noAuth).not.toContain('id="tok"');
  });
});
