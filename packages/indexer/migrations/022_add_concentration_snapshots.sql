-- Up Migration
--
-- Voting-power concentration & decentralization monitor (issue #1012).
-- One row per periodic snapshot (see `maybeTakeConcentrationSnapshot` in
-- packages/indexer/src/concentration.ts). All *_bps columns are basis points
-- (0-10000). `nakamoto_coefficient` is a plain count of addresses.
--
-- NB: the issue proposed the filename `010_add_concentration_snapshots.sql`,
-- but 010 is already taken (010_add_treasury_streams.sql); this continues the
-- real sequence from the current highest migration (020).

CREATE TABLE IF NOT EXISTS concentration_snapshots (
  id                            SERIAL PRIMARY KEY,
  ledger                        INTEGER NOT NULL,
  computed_at                   TIMESTAMPTZ DEFAULT NOW(),
  total_voting_power            NUMERIC(38, 0) NOT NULL,
  top1_share_bps                INTEGER NOT NULL,
  top5_share_bps                INTEGER NOT NULL,
  top10_share_bps               INTEGER NOT NULL,
  top20_share_bps               INTEGER NOT NULL,
  gini_coefficient_bps          INTEGER NOT NULL,   -- 0-10000
  nakamoto_coefficient          INTEGER NOT NULL,
  delegate_top5_share_bps       INTEGER NOT NULL,
  delegate_gini_coefficient_bps INTEGER NOT NULL,
  UNIQUE (ledger)
);

CREATE INDEX IF NOT EXISTS idx_concentration_ledger ON concentration_snapshots(ledger DESC);

-- Down Migration

DROP TABLE IF EXISTS concentration_snapshots;
