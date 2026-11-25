"use client";

import { ProposalState } from "@nebgov/sdk";
import { useTranslations } from "next-intl";

const STATE_CONFIG: Record<ProposalState, { color: string; icon: string }> = {
  [ProposalState.Pending]: { color: "bg-yellow-100 text-yellow-800 border border-yellow-200", icon: '⏳' },
  [ProposalState.Active]: { color: "bg-blue-100 text-blue-800 border border-blue-200", icon: '●' },
  [ProposalState.Succeeded]: { color: "bg-green-100 text-green-800 border border-green-200", icon: '✓' },
  [ProposalState.Defeated]: { color: "bg-red-100 text-red-800 border border-red-200", icon: '✕' },
  [ProposalState.Queued]: { color: "bg-purple-100 text-purple-800 border border-purple-200", icon: '⏳' },
  [ProposalState.Executed]: { color: "bg-purple-100 text-purple-800 border border-purple-200", icon: '✅' },
  [ProposalState.Cancelled]: { color: "bg-gray-100 text-gray-700 border border-gray-200", icon: '⊘' },
  [ProposalState.Expired]: { color: "bg-rose-100 text-rose-800 border border-rose-200", icon: '⌛' },
};

const STATE_KEY_MAP: Record<ProposalState, string> = {
  [ProposalState.Pending]: "pending",
  [ProposalState.Active]: "active",
  [ProposalState.Succeeded]: "succeeded",
  [ProposalState.Defeated]: "defeated",
  [ProposalState.Queued]: "queued",
  [ProposalState.Executed]: "executed",
  [ProposalState.Cancelled]: "cancelled",
  [ProposalState.Expired]: "expired",
};

interface Props {
  state: ProposalState;
}

export function ProposalStateBadge({ state }: Props) {
  const t = useTranslations("proposal");
  const tCard = useTranslations("proposalCard");
  
  const meta = STATE_CONFIG[state];
  const stateKey = STATE_KEY_MAP[state];

  if (!meta || !stateKey) {
    return (
      <span className="px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700 border border-gray-200">
        {tCard("unknownState")}
      </span>
    );
  }

  return (
    <span className={`px-3 py-1 rounded-full text-xs font-medium ${meta.color}`}>
      {meta.icon} {t(stateKey as any)}
    </span>
  );
}
