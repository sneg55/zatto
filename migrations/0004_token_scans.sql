CREATE TABLE token_scans (
  chain TEXT NOT NULL, token TEXT NOT NULL, computed_at TEXT NOT NULL, result TEXT NOT NULL,
  PRIMARY KEY (chain, token)
);
