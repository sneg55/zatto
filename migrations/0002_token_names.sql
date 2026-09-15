CREATE TABLE token_names (
  chain TEXT NOT NULL, token TEXT NOT NULL, symbol TEXT NOT NULL, seen_at TEXT NOT NULL,
  PRIMARY KEY (chain, token)
);
