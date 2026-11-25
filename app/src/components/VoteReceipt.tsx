"use client";

import { VoteSupport } from "@nebgov/sdk";
import { useGovernorConfig } from "@/hooks/useGovernorConfig";
import { useTranslations, useFormatter } from "next-intl";

interface Props {
  support: VoteSupport;
  weight: bigint;
  reason?: string;
}

const SUPPORT_COLORS: Record<VoteSupport, string> = {
  [VoteSupport.For]: "text-emerald-600",
  [VoteSupport.Against]: "text-rose-600",
  [VoteSupport.Abstain]: "text-slate-500",
};

export function VoteReceipt({ support, weight, reason }: Props) {
  const { divisor } = useGovernorConfig();
  const t = useTranslations("voting");
  const tProposal = useTranslations("proposal");
  const format = useFormatter();

  const supportLabels: Record<VoteSupport, string> = {
    [VoteSupport.For]: tProposal("for"),
    [VoteSupport.Against]: tProposal("against"),
    [VoteSupport.Abstain]: tProposal("abstain"),
  };

  return (
    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
      <p className="text-emerald-800 font-medium">
        {t("voteRecorded", { support: supportLabels[support] })}
      </p>
      <p className="text-sm text-emerald-700 mt-1">
        {t("votingPowerAmount", { amount: format.number(Number(weight) / divisor) })}
      </p>
      {reason && (
        <p className="text-sm text-emerald-700 mt-1 italic">&quot;{reason}&quot;</p>
      )}
    </div>
  );
}
