import type { Summary } from './kpis';
import type { DigestResult } from './digest';

function money(cents: number, currency: string): string {
  return `${(cents / 100).toFixed(2)} ${currency.toUpperCase()}`;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * One-pager dashboard: hero net number, plain stat line, source table with
 * inline bars, AI digest below. No boxed cards. Mobile-first.
 */
export function renderDashboard(
  current: Summary,
  netChangePct: number | null,
  digest: DigestResult | null,
  opts: { demoMode?: boolean; aiAvailable?: boolean; unverifiedFigures?: string[]; digestAuthRequired?: boolean } = {},
): string {
  const change = netChangePct === null ? 'no prior period' : `${netChangePct > 0 ? '+' : ''}${netChangePct}% vs previous`;
  const maxNet = Math.max(1, ...current.bySource.map((s) => s.netCents));

  const rows = current.bySource
    .map((s) => {
      const w = Math.max(2, Math.round((s.netCents / maxNet) * 100));
      return `<tr><td class="src">${esc(s.source)}</td>
<td class="barcell"><div class="bar" style="width:${w}%"></div></td>
<td class="num">${money(s.netCents, current.currency)}</td>
<td class="num muted pct">${(s.refundRate * 100).toFixed(1)}%</td></tr>`;
    })
    .join('\n');

  const demoBadge = opts.demoMode
    ? '<p class="demo">DEMO DATA - sample events, not real revenue</p>'
    : '';

  const unverified = opts.unverifiedFigures ?? [];
  const digestSection = digest
    ? unverified.length
      ? `<section class="digest">
<h2>AI digest</h2>
<p class="meta">written by ${esc(digest.model)} (${digest.provider === 'muse-spark-meta-hosted' ? 'Meta Model API (hosted Muse Spark)' : digest.provider === 'muse-endpoint' ? 'Muse endpoint (self-hosted Glimmer)' : 'Workers AI fallback'}) · ${esc(digest.generatedAt)}</p>
<p class="warn">Digest withheld: ${unverified.length} figure${unverified.length === 1 ? '' : 's'} (${esc(unverified.slice(0, 5).join(', '))}) could not be verified against the numbers above. The model's text is hidden rather than shown with unverified claims.</p>
</section>`
      : `<section class="digest">
<h2>AI digest</h2>
<p class="meta">written by ${esc(digest.model)} (${digest.provider === 'muse-spark-meta-hosted' ? 'Meta Model API (hosted Muse Spark)' : digest.provider === 'muse-endpoint' ? 'Muse endpoint (self-hosted Glimmer)' : 'Workers AI fallback'}) from the numbers above · ${esc(digest.generatedAt)}</p>
<div class="digestbody">${esc(digest.digest).replace(/\n/g, '<br>')}</div>
</section>`
    : `<section class="digest">
<h2>AI digest</h2>
<p class="meta muted">AI summary offline - showing computed numbers only. The digest is generated on demand from the figures above, never stored guesses.</p>
${opts.digestAuthRequired ? '<input id="tok" type="password" placeholder="ingest token" autocomplete="off" style="font:inherit;font-size:.85rem;padding:.45rem .6rem;border:1px solid #d6d3cd;border-radius:6px;margin-right:.5rem">' : ''}<button id="gen" type="button">Generate digest</button>
</section>`;

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>tracemint - ai revenue analyst</title>
<style>
:root { color-scheme: light; }
* { margin: 0; box-sizing: border-box; }
body {
  font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
  color: #191817; background: #fdfdfb;
  max-width: 640px; margin: 0 auto; padding: 3rem 1.25rem 4rem;
  line-height: 1.5;
}
header { margin-bottom: 2.5rem; }
h1 { font-size: 1rem; font-weight: 600; letter-spacing: .02em; }
h1 .dot { color: #c2410c; }
.demo {
  display: inline-block; margin-top: .5rem; padding: .15rem .5rem;
  font-size: .7rem; font-weight: 600; letter-spacing: .06em;
  color: #92400e; background: #fef3c7; border-radius: 4px;
}
.hero { margin-bottom: 2.25rem; }
.hero .net { font-size: 3rem; font-weight: 700; letter-spacing: -0.03em; line-height: 1.1; }
.hero .change { color: #6b6660; font-size: .9rem; margin-top: .25rem; }
.change.pos { color: #166534; } .change.neg { color: #b91c1c; }
.stats { display: flex; flex-wrap: wrap; gap: .25rem 1.75rem; margin-bottom: 2.5rem; font-size: .85rem; }
.stats div span { display: block; color: #6b6660; font-size: .72rem; letter-spacing: .05em; text-transform: uppercase; }
.stats div b { font-weight: 600; }
h2 { font-size: .78rem; font-weight: 600; text-transform: uppercase; letter-spacing: .07em; color: #6b6660; margin-bottom: .75rem; }
table { width: 100%; border-collapse: collapse; margin-bottom: 2.75rem; }
td { padding: .45rem 0; font-size: .9rem; vertical-align: middle; }
.src { width: 6.5rem; font-weight: 500; padding-right: 1rem; }
.barcell { width: 40%; padding-right: .75rem; }
.bar { height: 6px; background: #c2410c; border-radius: 3px; }
.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.pct { padding-left: 1.25rem; }
.cols td { padding: 0 0 .35rem; font-size: .68rem; font-weight: 600; letter-spacing: .07em; text-transform: uppercase; color: #8a857f; }
.cols td.pct { padding-left: 1.25rem; }
.muted { color: #8a857f; }
.warn {
  font-size: .85rem; color: #92400e; background: #fef3c7;
  border: 1px solid #fde68a; border-radius: 6px; padding: .6rem .8rem;
}
.digest .meta { font-size: .75rem; color: #8a857f; margin-bottom: .75rem; }
.digestbody { font-size: .92rem; white-space: normal; }
button {
  font: inherit; font-size: .85rem; padding: .45rem 1rem; cursor: pointer;
  color: #fdfdfb; background: #191817; border: 0; border-radius: 6px;
}
button:disabled { opacity: .5; cursor: wait; }
@media (max-width: 420px) {
  .hero .net { font-size: 2.3rem; }
  .src { width: 5rem; }
}
</style></head><body>
<header><h1>tracemint <span class="dot">·</span> ai revenue analyst</h1>${demoBadge}</header>
<section class="hero">
<div class="net">${money(current.netCents, current.currency)}</div>
<div class="change ${netChangePct !== null ? (netChangePct >= 0 ? 'pos' : 'neg') : ''}">${esc(change)} · last ${Math.round((current.periodEnd - current.periodStart) / 86400)} days</div>
</section>
<div class="stats">
<div><span>gross</span><b>${money(current.grossCents, current.currency)}</b></div>
<div><span>refunds</span><b>${money(current.refundCents, current.currency)}</b></div>
<div><span>refund rate</span><b>${(current.refundRate * 100).toFixed(1)}%</b></div>
<div><span>orders</span><b>${current.charges}</b></div>
<div><span>avg order</span><b>${money(current.aovCents, current.currency)}</b></div>
</div>
<section>
<h2>net by source</h2>
<table>${rows ? `<tr class="cols"><td></td><td></td><td class="num">net</td><td class="num muted pct">refund%</td></tr>${rows}` : '<tr><td class="muted">no events in this period</td></tr>'}</table>
</section>
${digestSection}
<script>
const btn = document.getElementById('gen');
if (btn) btn.addEventListener('click', async () => {
  btn.disabled = true; btn.textContent = 'Generating…';
  try {
    const days = new URLSearchParams(location.search).get('days') || '7';
    const tok = document.getElementById('tok');
    const r = await fetch('/api/digest?days=' + encodeURIComponent(days), { method: 'POST', headers: tok ? { authorization: 'Bearer ' + tok.value } : {} });
    if (r.status === 401) { btn.disabled = false; btn.textContent = 'Wrong token - try again'; return; }
    if (!r.ok) throw new Error('digest failed');
    const d = await r.json();
    // render the digest we already paid for instead of reloading (a reload
    // would trigger a second paid generation)
    const sec = btn.closest('section');
    if (sec && d.digest) {
      const un = (d.unverifiedFigures && d.unverifiedFigures.length) || 0;
      const escH = (t) => String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;');
      sec.innerHTML = un
        ? '<h2>AI digest</h2><p class="warn">Digest withheld: ' + un + ' figure(s) could not be verified against the numbers above.</p>'
        : '<h2>AI digest</h2><p class="meta">written by ' + escH(d.model) + ' (' + escH(d.provider) + ') from the numbers above · ' + escH(d.generatedAt) + '</p><div class="digestbody">' + escH(d.digest).replace(/\\n/g,'<br>') + '</div>';
    }
  } catch { btn.disabled = false; btn.textContent = 'Try again'; }
});
</script>
</body></html>`;
}
