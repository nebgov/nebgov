import { MockContractError } from "./errors";
import { CoSponsorshipDraftRecord, MockLedgerStore } from "./store";
import { LedgerClock } from "../ledger";
import { governorExecutor } from "./governor-executor";
import { tokenVotesExecutor } from "./token-votes-executor";

function getDraft(store: MockLedgerStore, id: bigint): CoSponsorshipDraftRecord {
  const draft = store.coSponsorship.drafts.get(id);
  if (!draft) throw new MockContractError(1, `draft ${id} not found`);
  return draft;
}

export const coSponsorshipExecutor = {
  create_draft(store: MockLedgerStore, clock: LedgerClock, caller: string, args: unknown[]): bigint {
    const [creator, description, descriptionHash, metadataUri, targets, fnNames, calldatas] = args as [
      string,
      string,
      Uint8Array,
      string,
      string[],
      string[],
      Uint8Array[],
    ];
    if (caller !== creator) throw new MockContractError(100, "create_draft: creator must authorize this call");
    if (targets.length === 0 || targets.length !== fnNames.length || targets.length !== calldatas.length) {
      throw new MockContractError(2, "create_draft: invalid action");
    }

    const id = store.coSponsorship.draftCount + 1n;
    store.coSponsorship.drafts.set(id, {
      id,
      creator,
      description,
      descriptionHash,
      metadataUri,
      targets,
      fnNames,
      calldatas,
      createdLedger: clock.sequence,
      expiryLedger: clock.sequence + 7_200,
      coSponsors: [],
      coSponsorPower: [],
      totalPower: 0n,
      finalized: false,
      cancelled: false,
    });
    store.coSponsorship.draftCount = id;
    return id;
  },

  co_sponsor(store: MockLedgerStore, clock: LedgerClock, caller: string, args: unknown[]): null {
    const [sponsor, draftId] = args as [string, bigint];
    if (caller !== sponsor) throw new MockContractError(100, "co_sponsor: sponsor must authorize this call");
    const draft = getDraft(store, draftId);
    if (draft.finalized || draft.cancelled || clock.sequence > draft.expiryLedger) {
      throw new MockContractError(3, "co_sponsor: draft is closed");
    }
    if (draft.coSponsors.includes(sponsor)) {
      throw new MockContractError(4, "co_sponsor: sponsor already pledged");
    }

    const power = tokenVotesExecutor.get_votes(store.votes, clock, sponsor, [sponsor]);
    if (power <= 0n) throw new MockContractError(5, "co_sponsor: sponsor has no voting power");
    draft.coSponsors.push(sponsor);
    draft.coSponsorPower.push(power);
    draft.totalPower += power;
    return null;
  },

  finalize_draft(store: MockLedgerStore, clock: LedgerClock, caller: string, args: unknown[]): bigint {
    const [creator, draftId] = args as [string, bigint];
    if (caller !== creator) throw new MockContractError(100, "finalize_draft: creator must authorize this call");
    const draft = getDraft(store, draftId);
    if (draft.creator !== creator) throw new MockContractError(6, "finalize_draft: unauthorized creator");
    if (draft.finalized || draft.cancelled || clock.sequence > draft.expiryLedger) {
      throw new MockContractError(3, "finalize_draft: draft is closed");
    }

    const powers = draft.coSponsors.map((sponsor) =>
      tokenVotesExecutor.get_votes(store.votes, clock, sponsor, [sponsor]),
    );
    const currentPower = powers.reduce((total, power) => total + power, 0n);
    if (currentPower < store.governor.settings.proposalThreshold) {
      throw new MockContractError(7, "finalize_draft: threshold not met");
    }

    const proposalId = governorExecutor.propose_via_registry(store, clock, store.addresses.coSponsorship, [
      store.addresses.coSponsorship,
      draft.creator,
      draft.description,
      draft.descriptionHash,
      draft.metadataUri,
      draft.targets,
      draft.fnNames,
      draft.calldatas,
    ]);
    draft.coSponsorPower = powers;
    draft.totalPower = currentPower;
    draft.finalized = true;
    return proposalId;
  },

  get_draft(store: MockLedgerStore, _clock: LedgerClock, _caller: string, args: unknown[]): CoSponsorshipDraftRecord {
    return getDraft(store, args[0] as bigint);
  },
};
