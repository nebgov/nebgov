"use client";

import { useTranslations } from "next-intl";

interface ErrorStateProps {
  title: string;
  message?: string;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}

export function ErrorState({
  title,
  message,
  onRetry,
  retryLabel,
  className = "",
}: ErrorStateProps) {
  const t = useTranslations("common");
  
  return (
    <div
      role="alert"
      className={`rounded-xl border border-red-200 bg-red-50 p-6 text-center ${className}`.trim()}
    >
      <h2 className="text-lg font-semibold text-red-900">{title}</h2>
      <p className="mt-2 text-sm text-red-700">
        {message || t("tryAgainLater")}
      </p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 inline-flex items-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
        >
          {retryLabel || t("tryAgain")}
        </button>
      ) : null}
    </div>
  );
}
