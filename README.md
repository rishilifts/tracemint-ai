# TraceMint AI Analyst

https://github.com/user-attachments/assets/c0afdbe5-e38d-40a7-8149-646571d18a9c

Grounded weekly revenue answers from raw payment events: a deterministic TypeScript engine computes the numbers, and Meta's Muse Spark (`muse-spark-1.2`) via the Meta Model API words the weekly digest. Every figure the model writes is checked against the computed summary before the digest is shown; a failing digest is withheld.

Built for the **Meta AI Developer Hackathon** (Cerebral Valley) - new work during the official build window (Oct 27 - Nov 4, 2026). The video uses demo data; the digest shown in it is real recorded output from the Meta Model API. Video download: [releases/tag/demo-video](https://github.com/rishilifts/tracemint-ai/releases/tag/demo-video)

## How it works

1. **Ingest** - `POST /ingest` stores one event at a time in D1 (`charge` / `refund` / `dispute`, with acquisition source; schema in `schema/schema.sql`):
   ```json
   { "id": "evt_1", "ts": 1761609600, "kind": "charge", "amountCents": 4900, "currency": "usd", "source": "newsletter", "utmCampaign": "oct-launch" }
   ```
2. **Numbers** - `src/lib/kpis.ts` computes gross, refunds, disputes, net, refund rate, average order value, per-source breakdowns and daily net. All arithmetic is plain TypeScript.
3. **Digest** - `POST /api/digest?days=7` builds a prompt containing only those computed numbers and asks Muse Spark to word it in three fixed sections: WHAT HAPPENED / WHAT CHANGED / WHAT TO WATCH. Generation is explicit and stored in D1; the dashboard and `GET` endpoints are read-only and never call the model.

## Model routing

Every digest carries an explicit provider label in the API and on the dashboard. A configured endpoint that fails surfaces an error instead of silently falling back.

1. **`muse-spark-meta-hosted`** - Muse Spark (`muse-spark-1.2`) via Meta's hosted Meta Model API (`MUSE_BASE_URL=https://api.meta.ai`, `MUSE_API_KEY`). The primary, hackathon-qualifying route.
2. **`muse-endpoint`** - experimental self-hosted Meta open-weights Muse Glimmer 30B (sha256-pinned GGUF, llama.cpp on Modal CPU; source in `modal/`). Its keyed client was e2e-tested; the full app test did not pass, and it is kept stopped.
3. **`workers-ai`** - Cloudflare Workers AI Llama 3.3 70B (`@cf/meta/llama-3.3-70b-instruct-fp8-fast`). Labeled development fallback only, never presented as the hackathon-qualifying route.

`MUSE_BASE_URL` selects the route; `MUSE_MODEL_ID` overrides the model id sent.

## Endpoints

| Method | Path          | Purpose                                         |
|--------|---------------|-------------------------------------------------|
| POST   | `/ingest`     | store one event (Bearer token if set)           |
| GET    | `/api/kpis`   | current vs previous period KPIs + delta         |
| POST   | `/api/digest` | generate + store the digest (token-gated)       |
| GET    | `/api/digest` | read the latest stored digest (never generates) |
| GET    | `/health`     | liveness + model id                             |

## Run it

```bash
npm install
npx wrangler d1 create tracemint          # then paste the id into wrangler.toml
npx wrangler d1 execute tracemint --file=schema/schema.sql
npx wrangler secret put MUSE_API_KEY      # Meta Model API key
npm run dev                               # local dev server
npm test                                  # 34 vitest unit tests
npm run typecheck
```

`MUSE_BASE_URL` and `MUSE_MODEL_ID` go in `wrangler.toml [vars]`. Set `INGEST_TOKEN` (`npx wrangler secret put INGEST_TOKEN`) to require a Bearer token on `/ingest`.

## Design choices

- **Model never touches raw events.** It receives a fixed, deterministic summary; every figure in its output is checked against the computed numbers (`validateDigest`) before the digest is shown.
- **Money is integer cents** everywhere; formatting happens once, in the prompt.
- **Idempotent ingest** via `INSERT OR REPLACE` on event id, so webhook retries are safe.
- **Stable UTC-day windows**: "last N days" ends at the next UTC midnight, so the current window includes the partial current day.

## Stack

Cloudflare Workers + D1 (SQLite), TypeScript, Vitest. Digest: Meta Muse Spark (`muse-spark-1.2`) via the Meta Model API.
