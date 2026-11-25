"use client";

/**
 * Subscribes to governor events via the indexer WebSocket (with polling
 * fallback) and polls proposal state while a wallet is connected.
 * Shows browser Notification + appends local history when toggles allow.
 */

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import {
  GovernorClient,
  ProposalState,
  subscribeToProposals,
  getProposalEvents,
  parseProposalCreatedEvent,
  streamEvents,
} from "@nebgov/sdk";
import { useWallet } from "../lib/wallet-context";
import {
  appendNotificationHistory,
  loadNotificationToggles,
  loadProposalMeta,
  mergeProposalMetaEntry,
  saveProposalMeta,
  type NotificationToggles,
} from "../lib/governance-notifications";
import {
  readGovernorConfig,
  readIndexerUrl,
  subscriptionOptsFromConfig,
} from "../lib/nebgov-env";

const POLL_MS = 10_000;
const VOTING_SOON_LEDGERS = 24;
const BACKFILL_MAX_LEDGER_WINDOW = 80_000;

function sameStrKey(a: string, b: string): boolean {
  return a.toUpperCase() === b.toUpperCase();
}

function showSystemNotification(title: string, body: string, tag: string) {
  if (typeof Notification === "undefined") return;
  if (Notification.permission !== "granted") return;
  try {
    new Notification(title, { body, tag });
  } catch {
    /* ignore */
  }
}

function recordAndNotify(
  t: any,
  toggles: NotificationToggles,
  toggleKey: keyof NotificationToggles,
  kind: Parameters<typeof appendNotificationHistory>[0]["kind"],
  proposalId: bigint,
  titleKey: string,
  bodyKey: string,
  ledger?: number,
  bodyParams?: Record<string, any>
) {
  if (!toggles[toggleKey]) return;
  const title = t(titleKey, { id: proposalId.toString() });
  const body = t(bodyKey, bodyParams);
  appendNotificationHistory({
    kind,
    proposalId: proposalId.toString(),
    title,
    body,
    ledger,
  });
  showSystemNotification(title, body, `nebgov-${kind}-${proposalId}`);
}

function handleStateTransition(
  t: any,
  prev: ProposalState,
  next: ProposalState,
  id: bigint,
  toggles: NotificationToggles,
  latestLedger: number
) {
  if (prev === ProposalState.Pending && next === ProposalState.Active) {
    recordAndNotify(
      t,
      toggles,
      "active",
      "active",
      id,
      "proposalActive",
      "votingIsOpen",
      latestLedger
    );
    return;
  }

  if (prev === ProposalState.Active && next === ProposalState.Succeeded) {
    recordAndNotify(
      t,
      toggles,
      "outcome",
      "passed",
      id,
      "proposalPassed",
      "proposalSucceeded",
      latestLedger
    );
    return;
  }

  if (prev === ProposalState.Active && next === ProposalState.Defeated) {
    recordAndNotify(
      t,
      toggles,
      "outcome",
      "failed",
      id,
      "proposalFailed",
      "proposalDefeated",
      latestLedger
    );
    return;
  }

  if (prev === ProposalState.Succeeded && next === ProposalState.Queued) {
    recordAndNotify(
      t,
      toggles,
      "queued",
      "queued",
      id,
      "proposalQueued",
      "queuedForExecution",
      latestLedger
    );
    return;
  }

  if (prev === ProposalState.Queued && next === ProposalState.Executed) {
    recordAndNotify(
      t,
      toggles,
      "executed",
      "executed",
      id,
      "proposalExecuted",
      "onChainExecutionCompleted",
      latestLedger
    );
  }
}

function maybeNotifyVotingEndsSoon(
  t: any,
  toggles: NotificationToggles,
  id: bigint,
  state: ProposalState,
  latestLedger: number,
  meta: ReturnType<typeof loadProposalMeta>,
  votingSoonFired: Set<string>
) {
  if (state !== ProposalState.Active || !toggles.voting_ends_soon) return;
  const pid = id.toString();
  const row = meta[pid];
  if (!row) return;
  const left = row.endLedger - latestLedger;
  if (left <= 0 || left > VOTING_SOON_LEDGERS) return;
  const key = `${pid}-soon`;
  if (votingSoonFired.has(key)) return;
  votingSoonFired.add(key);
  recordAndNotify(
    t,
    toggles,
    "voting_ends_soon",
    "voting_ends_soon",
    id,
    "proposalVotingEndsSoon",
    "votingClosesInLedgers",
    latestLedger,
    { count: left }
  );
}

export function GovernorNotificationsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const t = useTranslations("governorNotificationsProvider");
  const { isConnected, publicKey } = useWallet();
  const prevStatesRef = useRef<Map<string, ProposalState>>(new Map());
  const votingSoonFiredRef = useRef<Set<string>>(new Set());
  const bootstrappedRef = useRef(false);

  useEffect(() => {
    const config = readGovernorConfig();
    if (!isConnected || !publicKey || !config) {
      prevStatesRef.current = new Map();
      bootstrappedRef.current = false;
      votingSoonFiredRef.current = new Set();
      return () => undefined;
    }

    const client = new GovernorClient(config);
    const subOpts = subscriptionOptsFromConfig(config);
    const prevMap = prevStatesRef.current;
    prevMap.clear();
    bootstrappedRef.current = false;
    votingSoonFiredRef.current = new Set();

    let stopped = false;

    void (async () => {
      try {
        const latest = await client.getLatestLedger();
        const fromLedger = Math.max(1, latest - BACKFILL_MAX_LEDGER_WINDOW);
        const events = await getProposalEvents(
          config.governorAddress,
          fromLedger,
          subOpts
        );
        if (stopped) return;
        const meta = loadProposalMeta();
        for (const ev of events) {
          const p = parseProposalCreatedEvent(ev);
          if (!p) continue;
          meta[p.proposalId.toString()] = {
            endLedger: p.endLedger,
            startLedger: p.startLedger,
            proposer: p.proposer,
          };
        }
        saveProposalMeta(meta);
      } catch {
        /* backfill is best-effort */
      }
    })();

    const unsubProposals = subscribeToProposals(
      config.governorAddress,
      (event) => {
        const parsed = parseProposalCreatedEvent(event);
        if (!parsed) return;
        mergeProposalMetaEntry(parsed.proposalId, {
          endLedger: parsed.endLedger,
          startLedger: parsed.startLedger,
          proposer: parsed.proposer,
        });

        const toggles = loadNotificationToggles();
        if (!toggles.created_self) return;
        if (!sameStrKey(parsed.proposer, publicKey)) return;

        appendNotificationHistory({
          kind: "created_self",
          proposalId: parsed.proposalId.toString(),
          title: t("yourProposalCreatedTitle", { id: parsed.proposalId.toString() }),
          body: t("proposalSubmittedFromWallet"),
          ledger: event.ledger,
        });
        showSystemNotification(
          t("proposalCreatedNotification", { id: parsed.proposalId.toString() }),
          t("walletSubmittedThisProposal"),
          `nebgov-created-${parsed.proposalId}`
        );
      },
      subOpts
    );

    async function tick() {
      if (stopped) return;
      try {
        const toggles = loadNotificationToggles();
        const [count, latestLedger] = await Promise.all([
          client.proposalCount(),
          client.getLatestLedger(),
        ]);
        if (stopped || count === 0n) {
          bootstrappedRef.current = true;
          return;
        }

        const meta = loadProposalMeta();
        const votingSoon = votingSoonFiredRef.current;
        const isBootstrap = !bootstrappedRef.current;

        for (let i = 1n; i <= count; i++) {
          if (stopped) return;
          const id = i;
          const pid = id.toString();
          let state: ProposalState;
          try {
            state = await client.getProposalState(id);
          } catch {
            continue;
          }

          if (isBootstrap) {
            prevMap.set(pid, state);
            maybeNotifyVotingEndsSoon(
              t,
              toggles,
              id,
              state,
              latestLedger,
              meta,
              votingSoon
            );
            continue;
          }

          const prev = prevMap.get(pid);
          if (prev !== undefined && prev !== state) {
            handleStateTransition(
              t,
              prev,
              state,
              id,
              toggles,
              latestLedger
            );
          }
          prevMap.set(pid, state);

          maybeNotifyVotingEndsSoon(
            t,
            toggles,
            id,
            state,
            latestLedger,
            meta,
            votingSoon
          );
        }

        if (isBootstrap) {
          bootstrappedRef.current = true;
        }
      } catch {
        /* next tick */
      }
    }

    void tick();
    const pollTimer = window.setInterval(() => void tick(), POLL_MS);

    const indexerUrl = readIndexerUrl();
    const unsubStream = indexerUrl
      ? streamEvents(
          indexerUrl,
          (event) => {
            if (event.type === "proposal_created") {
              const d = event.data;
              const id = BigInt(String(d.id ?? 0));
              mergeProposalMetaEntry(id, {
                endLedger: Number(d.end_ledger ?? 0),
                startLedger: Number(d.start_ledger ?? 0),
                proposer: String(d.proposer ?? ""),
              });
              const toggles = loadNotificationToggles();
              if (toggles.created_self && sameStrKey(String(d.proposer ?? ""), publicKey)) {
                appendNotificationHistory({
                  kind: "created_self",
                  proposalId: id.toString(),
                  title: t("yourProposalCreatedTitle", { id: id.toString() }),
                  body: t("proposalSubmittedFromWallet"),
                });
                showSystemNotification(
                  t("proposalCreatedNotification", { id: id.toString() }),
                  t("walletSubmittedThisProposal"),
                  `nebgov-created-${id}`
                );
              }
            }
          },
          { types: ["proposal_created", "vote_cast", "proposal_queued", "proposal_executed"] }
        )
      : undefined;

    return () => {
      stopped = true;
      unsubProposals();
      unsubStream?.();
      window.clearInterval(pollTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, publicKey]);

  return <>{children}</>;
}
