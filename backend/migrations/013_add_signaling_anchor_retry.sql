-- Up Migration

ALTER TABLE signaling_polls
  ADD COLUMN anchor_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN next_anchor_at TIMESTAMPTZ;

-- Down Migration

ALTER TABLE signaling_polls
  DROP COLUMN IF EXISTS anchor_attempts,
  DROP COLUMN IF EXISTS next_anchor_at;
