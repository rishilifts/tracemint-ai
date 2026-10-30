CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  ts INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('charge','refund','dispute')),
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'usd',
  source TEXT NOT NULL DEFAULT 'direct',
  utm_campaign TEXT,
  customer_hint TEXT
);
CREATE INDEX IF NOT EXISTS idx_events_ts ON events (ts);
CREATE INDEX IF NOT EXISTS idx_events_source ON events (source);

CREATE TABLE IF NOT EXISTS digests (
  period_start INTEGER NOT NULL,
  period_end INTEGER NOT NULL,
  digest TEXT NOT NULL,
  model TEXT NOT NULL,
  provider TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  grounded INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (period_start, period_end)
);
