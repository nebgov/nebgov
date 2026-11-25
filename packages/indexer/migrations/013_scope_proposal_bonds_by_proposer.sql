-- Up Migration

ALTER TABLE proposal_bonds DROP CONSTRAINT IF EXISTS proposal_bonds_description_hash_key;
ALTER TABLE proposal_bonds ADD CONSTRAINT proposal_bonds_proposer_hash_key UNIQUE (proposer_address, description_hash);

-- Down Migration

ALTER TABLE proposal_bonds DROP CONSTRAINT IF EXISTS proposal_bonds_proposer_hash_key;
ALTER TABLE proposal_bonds ADD CONSTRAINT proposal_bonds_description_hash_key UNIQUE (description_hash);
