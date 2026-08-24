-- Up Migration

-- Voting-power concentration snapshots (issue #1012). Computed
-- periodically by the indexer from its own indexed votes/delegates tables
-- (see `maybeTakeConcentrationSnapshot` in
-- `packages/indexer/src/events.ts` and `packages/indexer/src/concentration.ts`).
-- All share/Gini fields are basis points (0-10000) to avoid float drift in
-- storage; consumers render them as percentages (bps / 100).
CREATE TABLE IF NOT EXISTS concentration_snapshots (
    id SERIAL PRIMARY KEY,
    ledger INTEGER NOT NULL UNIQUE,
    computed_at TIMESTAMP DEFAULT NOW(),
    total_voting_power NUMERIC(38,0) NOT NULL,
    top1_share_bps INTEGER NOT NULL,
    top5_share_bps INTEGER NOT NULL,
    top10_share_bps INTEGER NOT NULL,
    top20_share_bps INTEGER NOT NULL,
    gini_coefficient_bps INTEGER NOT NULL,      -- 0-10000
    nakamoto_coefficient INTEGER NOT NULL,
    delegate_top5_share_bps INTEGER NOT NULL,
    delegate_gini_coefficient_bps INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_concentration_ledger ON concentration_snapshots(ledger DESC);

-- Down Migration

DROP TABLE IF EXISTS concentration_snapshots;