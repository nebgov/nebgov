"use client";

import { useTranslations } from "next-intl";
import toast from "react-hot-toast";

export function ShareButton({ url, title }: { url: string; title?: string }) {
  const t = useTranslations("voting");
  const tCommon = useTranslations("common");

  async function onShare() {
    try {
      const nav = typeof navigator !== "undefined" ? navigator : null;

      if (nav && "share" in nav) {
        await (nav as any).share({ url, title });
        return;
      }

      if (!nav) {
        throw new Error("Navigator is unavailable in this environment.");
      }

      await nav.clipboard.writeText(url);
      toast.success(tCommon("copied"), {
        style: { borderRadius: "10px", background: "#1e1b4b", color: "#fff" },
        iconTheme: { primary: "#818cf8", secondary: "#fff" },
      });
    } catch {
      toast.error(t("failedToShare"));
    }
  }

  return (
    <button
      type="button"
      onClick={onShare}
      className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-sm font-medium"
      aria-label={t("shareProposalLink")}
    >
      {t("share")}
    </button>
  );
}

