import { Keypair } from "@stellar/stellar-sdk";
import {
  GovernorClient,
  hashDescriptionSync,
  type GovernorSettings,
  type Network,
} from "@nebgov/sdk";
import { logger } from "../logger";
import type { AnalyzerInputs, RecommendationResult } from "./analyzer";

/**
 * Submits a recommendation as a real `update_config` governance proposal.
 *
 * Only called when `governance_tuning_config.auto_propose` is enabled and a
 * `RELAYER_SECRET_KEY` is configured — by default the analyzer only records
 * recommendations for a human to review (see `GovernanceTuningAnalyzerService`).
 *
 * Deliberately uses `@nebgov/sdk`'s `GovernorClient` rather than hand-rolling
 * the `update_config` calldata encoding a second time — this is the one
 * place in the backend that takes on the SDK's pinned `@stellar/stellar-sdk`
 * ^12 alongside the backend's own ^15 (see the version-mismatch note in
 * `backend/src/routes/relayer.ts`), accepted here since it's opt-in and
 * off by default, and re-deriving `proposals.ts`'s ScVal map encoding by
 * hand would be a much larger correctness risk for a rarely-exercised path.
 *
 * Returns the new proposal's id, or `null` if auto-propose isn't configured.
 */
export async function maybeAutoPropose(
  inputs: AnalyzerInputs,
  result: RecommendationResult,
): Promise<bigint | null> {
  const secret = process.env.RELAYER_SECRET_KEY;
  const governorAddress = process.env.GOVERNOR_CONTRACT_ID;
  const votesAddress = process.env.TOKEN_VOTES_CONTRACT_ID;
  const timelockAddress = process.env.TIMELOCK_CONTRACT_ID;
  if (!secret || !governorAddress || !votesAddress || !timelockAddress) {
    logger.warn(
      "governance-tuning: auto_propose is enabled but RELAYER_SECRET_KEY/GOVERNOR_CONTRACT_ID/TOKEN_VOTES_CONTRACT_ID/TIMELOCK_CONTRACT_ID aren't all configured — skipping auto-propose",
    );
    return null;
  }

  const network = (process.env.STELLAR_NETWORK ?? "testnet") as Network;
  const rpcUrl = process.env.STELLAR_RPC_URL ?? "https://soroban-testnet.stellar.org";
  const indexerUrl = process.env.INDEXER_URL ?? "http://localhost:3002";

  const governor = new GovernorClient({
    governorAddress,
    timelockAddress,
    votesAddress,
    network,
    rpcUrl,
    indexerUrl,
  });

  const currentSettings = await governor.getSettings(governorAddress);
  const newSettings: GovernorSettings = {
    ...currentSettings,
    quorumNumerator: result.recommendedQuorumNumerator,
    proposalThreshold: result.recommendedProposalThreshold,
  };

  const { target, fnName, calldata } = governor.buildUpdateConfigProposal(newSettings);

  const description = [
    "Governance tuning recommendation (automated)",
    "",
    `quorum_numerator: ${inputs.currentQuorumNumerator} -> ${result.recommendedQuorumNumerator}`,
    `proposal_threshold: ${inputs.currentProposalThreshold} -> ${result.recommendedProposalThreshold}`,
    "",
    result.rationale.quorumNumerator.reason,
    result.rationale.proposalThreshold.reason,
  ].join("\n");
  const descriptionHash = hashDescriptionSync(description);

  const signer = Keypair.fromSecret(secret);
  // `signer` is a `Keypair` from the backend's @stellar/stellar-sdk (^15);
  // `governor.propose` types its parameter against @nebgov/sdk's pinned ^12
  // copy. Same class, different package instances — identical at runtime
  // (publicKey()/sign() haven't changed across these majors), incompatible
  // only nominally to the type checker, hence the cast.
  const proposalId = await governor.propose(
    signer as unknown as Parameters<typeof governor.propose>[0],
    description,
    descriptionHash,
    "",
    [target],
    [fnName],
    [Buffer.from(calldata)],
  );

  logger.info({ proposalId: proposalId.toString() }, "Governance tuning auto-proposed on-chain");
  return proposalId;
}
