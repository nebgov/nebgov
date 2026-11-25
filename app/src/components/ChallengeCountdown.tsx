"use client";

/**
 * Countdown to an optimistic-governance proposal's challenge_end_ledger.
 * Thin wrapper around the existing generic `CountdownTimer` (its
 * label/targetLedger override mode), rather than reimplementing ledger→time
 * estimation — see `lib/utils/ledgerTime.ts`.
 */
import { CountdownTimer } from "./CountdownTimer";
import { useTranslations } from "next-intl";

interface ChallengeCountdownProps {
  challengeEndLedger: number;
  isElapsed?: boolean;
}

export function ChallengeCountdown({ challengeEndLedger, isElapsed }: ChallengeCountdownProps) {
  const t = useTranslations("optimistic");
  if (isElapsed) {
    return <span className="text-sm text-slate-500">{t("challengeWindowClosed")}</span>;
  }
  return (
    <CountdownTimer label={t("challengeWindowClosesIn")} targetLedger={challengeEndLedger} />
  );
}
