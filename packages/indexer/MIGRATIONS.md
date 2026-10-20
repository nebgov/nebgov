# Indexer migration maintenance

Migration filenames must begin with a unique three-digit prefix. Run
`pnpm --filter @nebgov/indexer run check:migrations` before committing a new
migration; CI runs the same check.

## Upgrading databases that ran a renamed migration

Migration `012_add_vote_escrow.sql` was renamed to
`023_add_vote_escrow.sql`, and `021_add_proposal_amendments.sql` was renamed to
`024_add_proposal_amendments.sql`, to remove duplicate numeric prefixes.

The SQL bodies did not change. If an existing database has already applied an
old filename, update only its node-pg-migrate bookkeeping name before running
new migrations so the same SQL is not executed twice:

```sql
BEGIN;

UPDATE pgmigrations_nebgov_indexer
SET name = regexp_replace(name, '^012_add_vote_escrow', '023_add_vote_escrow')
WHERE name LIKE '012_add_vote_escrow%';

UPDATE pgmigrations_nebgov_indexer
SET name = regexp_replace(
  name,
  '^021_add_proposal_amendments',
  '024_add_proposal_amendments'
)
WHERE name LIKE '021_add_proposal_amendments%';

COMMIT;
```

Confirm the affected row count before proceeding. A zero-row result means the
old migration was not recorded and the newly numbered migration should run
normally.

## Vote Escrow schema reconciliation (migration 025)

Migrations 017 and 025 previously declared the same `vote_escrow_locks` table,
while 023 declared a distinct legacy schema. Migration 025 now reconciles
existing layouts without deleting lock records. It widens legacy numeric and
ledger fields, and backfills the missing `updated_ledger` with 0 (the actual
historical update ledger is unknown).

The 023 schema permits multiple rows per `owner_address`, while the current
indexer also uses `ON CONFLICT (owner_address)` upserts. If existing rows
contain repeated owners, 025 deliberately fails while building its unique
index instead of automatically losing historical locks. Investigate the
per-owner projection versus multi-lock policy before retrying the upgrade.

Validate against a fresh database and one migrated through 024, including a
legacy-023 fixture. Rollback intentionally preserves the shared table.
