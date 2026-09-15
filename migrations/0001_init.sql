CREATE TABLE tape (
  chain TEXT NOT NULL, token TEXT NOT NULL, hour TEXT NOT NULL,
  rows TEXT NOT NULL, row_count INTEGER NOT NULL,
  pages_exhausted INTEGER NOT NULL DEFAULT 0, capped INTEGER NOT NULL DEFAULT 0,
  matured INTEGER NOT NULL DEFAULT 0, fetched_at TEXT NOT NULL, bytes INTEGER NOT NULL,
  PRIMARY KEY (chain, token, hour)
);
CREATE TABLE tape_lock (
  chain TEXT NOT NULL, token TEXT NOT NULL, hour TEXT NOT NULL, lease_until TEXT NOT NULL,
  PRIMARY KEY (chain, token, hour)
);
CREATE TABLE buys (
  chain TEXT NOT NULL, wallet TEXT NOT NULL, token TEXT NOT NULL, tx TEXT NOT NULL,
  ts TEXT NOT NULL, usd REAL, price REAL, fetched_at TEXT NOT NULL,
  PRIMARY KEY (chain, tx, wallet, token)
);
CREATE INDEX buys_wallet_ts ON buys (chain, wallet, ts);
CREATE TABLE wallet_fetch (
  chain TEXT NOT NULL, wallet TEXT NOT NULL, last_fetched TEXT NOT NULL,
  PRIMARY KEY (chain, wallet)
);
CREATE TABLE candles (
  chain TEXT NOT NULL, token TEXT NOT NULL, minute TEXT NOT NULL, close REAL NOT NULL,
  final INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (chain, token, minute)
);
CREATE TABLE candle_gap (
  chain TEXT NOT NULL, token TEXT NOT NULL, minute TEXT NOT NULL, reason TEXT NOT NULL,
  checked_at TEXT NOT NULL,
  PRIMARY KEY (chain, token, minute)
);
CREATE TABLE scores (
  chain TEXT NOT NULL, wallet TEXT NOT NULL, run_id TEXT NOT NULL,
  computed_at TEXT NOT NULL, provisional INTEGER NOT NULL DEFAULT 0, result TEXT NOT NULL,
  PRIMARY KEY (chain, wallet, run_id)
);
CREATE INDEX scores_wallet_time ON scores (chain, wallet, computed_at);
CREATE TABLE scan_jobs (
  run_id TEXT PRIMARY KEY, chain TEXT NOT NULL, source TEXT NOT NULL, status TEXT NOT NULL,
  created_at TEXT NOT NULL, started_at TEXT, finished_at TEXT,
  candidates TEXT NOT NULL DEFAULT '[]', cursor INTEGER NOT NULL DEFAULT 0,
  bucket_cursor INTEGER NOT NULL DEFAULT 0, planned_requests INTEGER NOT NULL DEFAULT 0,
  used_requests INTEGER NOT NULL DEFAULT 0, attempts INTEGER NOT NULL DEFAULT 0,
  lease_until TEXT, error TEXT, payment_id TEXT UNIQUE, payment_tx TEXT,
  published INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE calls (
  id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL, endpoint TEXT NOT NULL,
  credits INTEGER NOT NULL, run_id TEXT, status TEXT NOT NULL,
  remaining_minute INTEGER, remaining_second INTEGER
);
CREATE INDEX calls_ts ON calls (ts);
CREATE INDEX calls_status_ts ON calls (status, ts);
CREATE TABLE live_leases (key TEXT PRIMARY KEY, lease_until TEXT NOT NULL);
CREATE TABLE ip_counters (
  ip_hash TEXT NOT NULL, hour TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (ip_hash, hour)
);
