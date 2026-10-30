# tracemint-ai-analyst

An AI revenue analyst for a solo founder: it ingests raw commerce events
(charges, refunds, disputes) with their acquisition source, computes the
numbers deterministically, and asks Meta's Muse Spark (via the Meta Model API) to write a short
plain-English weekly digest from those numbers. Every figure the model
writes is checked against the computed summary before it is shown.

Built for the **Meta AI Developer Hackathon** (Cerebral Valley). New work,
built from scratch during the official build window (Oct 27 - Nov 4, 2026).

Development note: designed and built by Rishi Sahoo with AI pair-programming
assistance; every figure path is covered by the test suite (`npm test`).

## How it works

1. **Ingest** - `POST /ingest` accepts one event at a time:
   ```json
   { "id": "evt_1", "ts": 1761609600, "kind": "charge", "amountCents": 4900, "currency": "usd", "source": "newsletter", "utmCampaign": "oct-launch" }
   ```
   `kind` is `charge`, `refund`, or `dispute`. Events land in D1 (schema in `schema/schema.sql`).

2. **Numbers** - `src/lib/kpis.ts` computes gross, refunds, disputes, net,
   refund rate, average order value, per-source breakdowns and daily net.
   All arithmetic is plain TypeScript - the model never computes anything.

3. **Digest** - `POST /api/digest?days=7` summarizes the current period and
   the previous one, builds a prompt containing only those computed numbers,
   and asks **Meta's Muse Spark (`muse-spark-1.2`) via the Meta Model API** to
   word the digest. The prompt forbids the model from inventing figures; it
   only words the digest in three fixed sections: WHAT HAPPENED / WHAT
   CHANGED / WHAT TO WATCH. Generation is explicit and stored in D1; the
   dashboard and `GET` endpoints are read-only and never call the model.

## Model routing

The digest can run on three explicitly-labeled routes, shown on every digest
in the API and on the dashboard. A configured endpoint that fails surfaces an
error instead of silently falling back.

1. **`muse-spark-meta-hosted`** - Muse Spark (`muse-spark-1.2`) via Meta's
   hosted Meta Model API (`MUSE_BASE_URL=https://api.meta.ai`,
   `MUSE_API_KEY`). This is the primary hackathon-qualifying route.
2. **`muse-endpoint`** - self-hosted Meta open-weights Muse Glimmer 30B (GGUF
   community quant by unsloth, sha256-pinned) served by llama.cpp on Modal
   CPU - see `modal/` for the endpoint + e2e source. Unauthenticated requests
   get 401; a keyed request returns a complete digest whose figures all match
   the computed numbers.
3. **`workers-ai`** - `@cf/meta/llama-3.3-70b-instruct-fp8-fast` via
   Cloudflare Workers AI. Development fallback only, NOT the
   hackathon-qualifying route, and never presented as one.

`MUSE_BASE_URL` selects the route, `MUSE_MODEL_ID` overrides the model id
sent.

```bash
npx wrangler secret put MUSE_API_KEY
# MUSE_BASE_URL and MUSE_MODEL_ID go in wrangler.toml [vars]
```

## Endpoints

| Method | Path          | Purpose                                       |
|--------|---------------|-----------------------------------------------|
| POST   | `/ingest`     | store one event (Bearer token if set)         |
| GET    | `/api/kpis`   | current vs previous period KPIs + delta       |
| POST   | `/api/digest` | generate + store the digest (token-gated)     |
| GET    | `/api/digest` | read the latest stored digest (never generates)|
| GET    | `/health`     | liveness + model id                           |

## Run it

```bash
npm install
npx wrangler d1 create tracemint          # then paste the id into wrangler.toml
npx wrangler d1 execute tracemint --file=schema/schema.sql
npm run dev                               # local dev server
npm test                                  # vitest unit tests
npm run typecheck
```

Set `INGEST_TOKEN` (`npx wrangler secret put INGEST_TOKEN`) to require a
Bearer token on `/ingest`.

## Design choices

- **Model never touches raw events.** It receives a fixed, deterministic
  summary, and every figure in its output is then checked against the computed
  numbers (`validateDigest`); the API flags any figure it cannot ground instead
  of silently trusting the model.
- **Money is integer cents** everywhere; formatting happens once, in the prompt.
- **Idempotent ingest** via `INSERT OR REPLACE` on event id, so webhook retries
  are safe.

## Stack

Cloudflare Workers + D1 (SQLite), TypeScript, Vitest. Digest model: Meta Muse
Spark (`muse-spark-1.2`) via the Meta Model API; Cloudflare Workers AI (Llama
3.3 70B Instruct fp8-fast) as the labeled development fallback.

## Data windows

"Last N days" views use a stable UTC-day window ending at the next UTC midnight. The current window therefore includes the partial current UTC day, not N completed days. Digests are generated only on explicit request (POST /api/digest, token-gated when INGEST_TOKEN is set) and stored in D1; the dashboard and GET endpoints are read-only and never call the model.
