CREATE TABLE observations (
  chain TEXT NOT NULL,
  token TEXT NOT NULL,
  ts TEXT NOT NULL,
  burst REAL NOT NULL,
  crowded INTEGER NOT NULL,
  delayed_h24 REAL NOT NULL,
  baseline_rate REAL NOT NULL,
  new_buyers_10 INTEGER NOT NULL,
  seen_at TEXT NOT NULL,
  PRIMARY KEY (chain, token, ts)
);
CREATE INDEX observations_burst ON observations (chain, burst);
