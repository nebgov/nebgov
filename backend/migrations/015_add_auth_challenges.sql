-- One-time wallet login challenges. A wallet must prove control of its key
-- before the backend creates an authenticated session.
CREATE TABLE IF NOT EXISTS auth_challenges (
  nonce TEXT PRIMARY KEY,
  wallet_address VARCHAR(56) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auth_challenges_wallet
  ON auth_challenges (wallet_address, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_auth_challenges_expiry
  ON auth_challenges (expires_at);
