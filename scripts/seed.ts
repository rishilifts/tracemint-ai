/**
 * Seed a running worker with two weeks of plausible demo events.
 * usage: npx tsx scripts/seed.ts http://localhost:8787 [INGEST_TOKEN]
 */
const base = process.argv[2] ?? 'http://localhost:8787';
const token = process.argv[3];
const DAY = 86400;
const now = Math.floor(Date.now() / 1000);

const sources = ['newsletter', 'twitter', 'direct', 'reddit'];
const prices = [1900, 4900, 9900];

let n = 0;
async function post(body: unknown) {
  const res = await fetch(`${base}/ingest`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`seed failed: ${res.status} ${await res.text()}`);
}

for (let d = 13; d >= 0; d--) {
  for (const s of sources) {
    const count = s === 'newsletter' ? 2 : 1;
    for (let i = 0; i < count; i++) {
      await post({
        id: `demo-${++n}`,
        ts: now - d * DAY + i * 3600,
        kind: 'charge',
        amountCents: prices[(d + i) % prices.length],
        currency: 'usd',
        source: s,
      });
    }
  }
  if (d % 4 === 1) {
    await post({ id: `demo-${++n}`, ts: now - d * DAY + 7200, kind: 'refund', amountCents: 4900, currency: 'usd', source: 'twitter' });
  }
}
console.log(`seeded ${n} events into ${base}`);
