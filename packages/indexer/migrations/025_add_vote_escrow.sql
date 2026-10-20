-- Up Migration
-- Migration 017 already creates vote_escrow_locks on fresh installs, while
-- migration 023 can leave a different legacy layout on upgraded installs.
-- Reconcile either layout without dropping any lock records.
CREATE TABLE IF NOT EXISTS vote_escrow_locks (
  owner_address TEXT PRIMARY KEY,
  amount NUMERIC(39, 0) NOT NULL,
  start_ledger BIGINT NOT NULL,
  end_ledger BIGINT NOT NULL,
  initial_voting_power NUMERIC(39, 0) NOT NULL,
  withdrawn BOOLEAN NOT NULL DEFAULT false,
  updated_ledger BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The 023 layout had narrower types and lacked updated_ledger. Existing
-- legacy rows have no recorded update ledger, so backfill with 0.
ALTER TABLE vote_escrow_locks
  ALTER COLUMN owner_address TYPE TEXT,
  ALTER COLUMN amount TYPE NUMERIC(39, 0),
  ALTER COLUMN start_ledger TYPE BIGINT,
  ALTER COLUMN end_ledger TYPE BIGINT,
  ALTER COLUMN initial_voting_power TYPE NUMERIC(39, 0);

ALTER TABLE vote_escrow_locks
  ADD COLUMN IF NOT EXISTS updated_ledger BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS id BIGSERIAL;

-- The current LockCreated handler uses ON CONFLICT(owner_address).
-- If a legacy 023 database contains multiple locks per owner, PostgreSQL
-- intentionally refuses this index rather than silently deleting history.
-- Such databases need an explicit data-preservation policy before upgrade.
CREATE UNIQUE INDEX IF NOT EXISTS idx_vote_escrow_locks_owner_unique
  ON vote_escrow_locks(owner_address);

CREATE INDEX IF NOT EXISTS idx_vote_escrow_locks_end_ledger ON vote_escrow_locks(end_ledger);
CREATE INDEX IF NOT EXISTS idx_vote_escrow_locks_active ON vote_escrow_locks(withdrawn, end_ledger);
CREATE INDEX IF NOT EXISTS idx_vote_escrow_locks_amount ON vote_escrow_locks(amount DESC);

-- Down Migration
-- Deliberately do not DROP the shared table: it was already created by
-- 017/023, and removing it would destroy pre-existing lock data.
DROP INDEX IF EXISTS idx_vote_escrow_locks_amount;
DROP INDEX IF EXISTS idx_vote_escrow_locks_active;
DROP INDEX IF EXISTS idx_vote_escrow_locks_end_ledger;
DROP INDEX IF EXISTS idx_vote_escrow_locks_owner_unique;
