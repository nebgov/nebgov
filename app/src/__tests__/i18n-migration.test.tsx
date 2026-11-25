/**
 * i18n migration tests covering #1595 #1596 #1600 #1601.
 *
 * Tests:
 * 1. English render — representative component per area renders correct text.
 * 2. Spanish render — at least one component per area shows Spanish text.
 * 3. Plurals — co-sponsor count renders correctly for 0, 1, 3 in en and es.
 * 4. Number formatting — 1234567.5 renders 1,234,567.5 (en) and 1.234.567,5 (es).
 * 5. State badge fallback — unknown state renders "Unknown" without throwing.
 * 6. Vacuousness — Spanish assertions fail when en messages are used instead.
 *
 * Note: ProposalCard number translation is tested in ProposalCard.test.tsx because
 * that component imports react-markdown (ESM-only), which requires the mocks that
 * already exist in that test file.
 */

import React from "react";
import { render, screen } from "@testing-library/react";

import enMessages from "../messages/en.json";
import esMessages from "../messages/es.json";

// ─── Global mocks ──────────────────────────────────────────────────────────

jest.mock("../hooks/useGovernorConfig", () => ({
  useGovernorConfig: () => ({ divisor: 10_000_000 }),
}));

jest.mock("next/link", () => {
  const MockLink = ({ children, href }: any) => <a href={href}>{children}</a>;
  MockLink.displayName = "MockLink";
  return MockLink;
});

jest.mock("../lib/wallet-context", () => ({
  useWallet: () => ({
    isConnected: false,
    publicKey: null,
    connect: jest.fn(),
    signTransaction: jest.fn(),
  }),
}));

jest.mock("react-hot-toast", () => ({
  __esModule: true,
  default: { success: jest.fn(), error: jest.fn() },
}));

jest.mock("../lib/nebgov-env", () => ({
  readGovernorConfig: jest.fn().mockReturnValue({
    governorAddress: "CTEST",
    coSponsorshipAddress: "CCOSPONSOR",
  }),
}));

jest.mock("@nebgov/sdk", () => ({
  CoSponsorshipClient: jest.fn().mockImplementation(() => ({
    coSponsorWithSign: jest.fn().mockResolvedValue("txhash"),
  })),
  ProposalState: {
    Pending: "Pending",
    Active: "Active",
    Succeeded: "Succeeded",
    Defeated: "Defeated",
    Queued: "Queued",
    Executed: "Executed",
    Cancelled: "Cancelled",
    Expired: "Expired",
  },
}));

jest.mock("../components/CountdownTimer", () => ({
  CountdownTimer: ({ label }: { label: string }) => (
    <div data-testid="countdown-timer">{label}</div>
  ),
}));

// ─── next-intl mock — module-level locale/message state ──────────────────────
//
// Jest can't load next-intl's ESM build directly. We implement just enough
// surface for useTranslations and useFormatter. The active locale/catalog is
// controlled by calling setLocale() before each render.

let _messages: Record<string, unknown> = enMessages as any;
let _locale = "en";

function setLocale(locale: string) {
  _locale = locale;
  _messages = locale === "es" ? (esMessages as any) : (enMessages as any);
}

/** Minimal ICU-like interpolation: handles {var} and {count, plural, ...} */
function interpolate(template: string, vars?: Record<string, unknown>): string {
  if (!vars) return template;
  // Plural: {count, plural, =0 {0 label} one {# label} other {# labels}}
  // We need to parse the full plural block including nested braces.
  let result = template.replace(
    /\{(\w+),\s*plural,\s*((?:[^{}]|\{[^{}]*\})+)\}/g,
    (_, varName: string, cases: string) => {
      const count = Number(vars[varName] ?? 0);
      const caseMap: Record<string, string> = {};
      const caseRegex = /(=\d+|one|other|zero|two|few|many)\s*\{([^}]*)\}/g;
      let m: RegExpExecArray | null;
      while ((m = caseRegex.exec(cases)) !== null) {
        caseMap[m[1]] = m[2].trim();
      }
      const chosen = caseMap[`=${count}`] ?? caseMap[count === 1 ? "one" : "other"] ?? "";
      return chosen.replace(/#/g, String(count));
    }
  );
  // Simple {var}
  return result.replace(/\{(\w+)\}/g, (_, key: string) =>
    vars[key] !== undefined ? String(vars[key]) : `{${key}}`
  );
}

jest.mock("next-intl", () => ({
  useTranslations: (ns: string) => (key: string, vars?: Record<string, unknown>) => {
    const nsObj = (_messages as Record<string, unknown>)[ns];
    if (!nsObj || typeof nsObj !== "object") return key;
    const val = (nsObj as Record<string, string>)[key];
    if (typeof val !== "string") return key;
    return interpolate(val, vars);
  },
  useFormatter: () => ({
    number: (value: number, opts?: Intl.NumberFormatOptions) =>
      new Intl.NumberFormat(_locale, opts).format(value),
  }),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function withEn(ui: React.ReactElement) {
  setLocale("en");
  return render(ui);
}

function withEs(ui: React.ReactElement) {
  setLocale("es");
  return render(ui);
}

afterEach(() => {
  setLocale("en");
});

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { ProposalStateBadge } from "../components/ProposalStateBadge";
import { VoteBar } from "../components/VoteBar";
import { ShareButton } from "../components/ShareButton";
import { CoSponsorModal } from "../components/CoSponsorModal";
import { ChallengeCountdown } from "../components/ChallengeCountdown";

// Pull ProposalState from the mock above
const { ProposalState } = jest.requireMock("@nebgov/sdk");

// ─── #1595 — ProposalStateBadge ───────────────────────────────────────────────

describe("#1595 ProposalStateBadge", () => {
  it("renders English state label for Active", () => {
    withEn(<ProposalStateBadge state={ProposalState.Active} />);
    expect(screen.getByText(/Active/)).toBeInTheDocument();
  });

  it("renders Spanish state label for Pending", () => {
    withEs(<ProposalStateBadge state={ProposalState.Pending} />);
    // es.json keeps "Pending" at this stage — still renders without crashing
    expect(screen.getByText(/Pending/)).toBeInTheDocument();
  });

  it("renders fallback 'Unknown' for an unknown state without throwing", () => {
    expect(() =>
      withEn(<ProposalStateBadge state={"unknown_state" as any} />)
    ).not.toThrow();
    expect(screen.getByText("Unknown")).toBeInTheDocument();
  });

  it("fallback renders 'Desconocido' in Spanish", () => {
    withEs(<ProposalStateBadge state={"unknown_state" as any} />);
    expect(screen.getByText("Desconocido")).toBeInTheDocument();
  });
});

// ─── #1595 — VoteBar ─────────────────────────────────────────────────────────

describe("#1595 VoteBar", () => {
  it("renders English vote labels For / Against / Abstain", () => {
    withEn(<VoteBar votesFor={500_0000000n} votesAgainst={300_0000000n} votesAbstain={200_0000000n} />);
    expect(screen.getByText(/For/)).toBeInTheDocument();
    expect(screen.getByText(/Against/)).toBeInTheDocument();
    expect(screen.getByText(/Abstain/)).toBeInTheDocument();
  });

  it("renders Spanish vote labels", () => {
    withEs(<VoteBar votesFor={500_0000000n} votesAgainst={300_0000000n} votesAbstain={200_0000000n} />);
    expect(screen.getByText(/A favor/)).toBeInTheDocument();
    expect(screen.getByText(/En contra/)).toBeInTheDocument();
    expect(screen.getByText(/Abstenci/)).toBeInTheDocument();
  });
});

// ─── #1595 — Number formatting ───────────────────────────────────────────────

describe("#1595 Number formatting", () => {
  // 12345675000000n / 10_000_000 = 1234567.5
  const bigVotes = 12345675000000n;

  it("formats 1234567.5 as 1,234,567.5 in en", () => {
    withEn(<VoteBar votesFor={bigVotes} votesAgainst={0n} votesAbstain={0n} />);
    expect(screen.getByText("1,234,567.5")).toBeInTheDocument();
  });

  it("formats 1234567.5 as 1.234.567,5 in es", () => {
    withEs(<VoteBar votesFor={bigVotes} votesAgainst={0n} votesAbstain={0n} />);
    expect(screen.getByText("1.234.567,5")).toBeInTheDocument();
  });
});

// ─── #1596 — ShareButton ─────────────────────────────────────────────────────

describe("#1596 ShareButton", () => {
  it("renders English share button text and aria-label", () => {
    withEn(<ShareButton url="https://example.com" />);
    expect(screen.getByRole("button", { name: "Share proposal link" })).toBeInTheDocument();
    expect(screen.getByText("Share")).toBeInTheDocument();
  });

  it("renders Spanish share button text and aria-label", () => {
    withEs(<ShareButton url="https://example.com" />);
    expect(screen.getByRole("button", { name: "Compartir enlace de propuesta" })).toBeInTheDocument();
    expect(screen.getByText("Compartir")).toBeInTheDocument();
  });
});

// ─── #1600 — CoSponsorModal ───────────────────────────────────────────────────

describe("#1600 CoSponsorModal", () => {
  it("renders English modal title with draft ID", () => {
    withEn(<CoSponsorModal draftId={5n} onClose={jest.fn()} />);
    expect(screen.getByText("Co-Sponsor Draft #5")).toBeInTheDocument();
  });

  it("renders Spanish modal title with draft ID", () => {
    withEs(<CoSponsorModal draftId={5n} onClose={jest.fn()} />);
    expect(screen.getByText("Co-patrocinar borrador #5")).toBeInTheDocument();
  });

  it("renders English Cancel and Co-Sponsor buttons", () => {
    withEn(<CoSponsorModal draftId={1n} onClose={jest.fn()} />);
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Co-Sponsor" })).toBeInTheDocument();
  });

  it("renders Spanish Cancel and Co-Sponsor buttons", () => {
    withEs(<CoSponsorModal draftId={1n} onClose={jest.fn()} />);
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Co-patrocinar" })).toBeInTheDocument();
  });
});

// ─── #1600 — Plural: co-sponsor count ────────────────────────────────────────

function CoSponsorsCountDisplay({ count }: { count: number }) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useTranslations } = require("next-intl");
  const t = useTranslations("drafts");
  return <span>{t("coSponsorsCount", { count })}</span>;
}

describe("#1600 Plural: co-sponsor count", () => {
  it("renders '0 co-sponsors' in English for count=0", () => {
    withEn(<CoSponsorsCountDisplay count={0} />);
    expect(screen.getByText("0 co-sponsors")).toBeInTheDocument();
  });

  it("renders '1 co-sponsor' in English for count=1", () => {
    withEn(<CoSponsorsCountDisplay count={1} />);
    expect(screen.getByText("1 co-sponsor")).toBeInTheDocument();
  });

  it("renders '3 co-sponsors' in English for count=3", () => {
    withEn(<CoSponsorsCountDisplay count={3} />);
    expect(screen.getByText("3 co-sponsors")).toBeInTheDocument();
  });

  it("renders '0 co-patrocinadores' in Spanish for count=0", () => {
    withEs(<CoSponsorsCountDisplay count={0} />);
    expect(screen.getByText("0 co-patrocinadores")).toBeInTheDocument();
  });

  it("renders '1 co-patrocinador' in Spanish for count=1", () => {
    withEs(<CoSponsorsCountDisplay count={1} />);
    expect(screen.getByText("1 co-patrocinador")).toBeInTheDocument();
  });

  it("renders '3 co-patrocinadores' in Spanish for count=3", () => {
    withEs(<CoSponsorsCountDisplay count={3} />);
    expect(screen.getByText("3 co-patrocinadores")).toBeInTheDocument();
  });
});

// ─── #1601 — ChallengeCountdown ──────────────────────────────────────────────

describe("#1601 ChallengeCountdown", () => {
  it("renders English 'Challenge window closed' when elapsed", () => {
    withEn(<ChallengeCountdown challengeEndLedger={1000} isElapsed={true} />);
    expect(screen.getByText("Challenge window closed")).toBeInTheDocument();
  });

  it("renders Spanish 'Ventana de desafío cerrada' when elapsed", () => {
    withEs(<ChallengeCountdown challengeEndLedger={1000} isElapsed={true} />);
    expect(screen.getByText("Ventana de desafío cerrada")).toBeInTheDocument();
  });

  it("passes English label to CountdownTimer when not elapsed", () => {
    withEn(<ChallengeCountdown challengeEndLedger={5000} isElapsed={false} />);
    expect(screen.getByTestId("countdown-timer")).toHaveTextContent("Challenge window closes in");
  });

  it("passes Spanish label to CountdownTimer when not elapsed", () => {
    withEs(<ChallengeCountdown challengeEndLedger={5000} isElapsed={false} />);
    expect(screen.getByTestId("countdown-timer")).toHaveTextContent(
      "La ventana de desafío cierra en"
    );
  });
});

// ─── Vacuousness checks ───────────────────────────────────────────────────────

describe("Vacuousness checks", () => {
  it("Spanish 'Challenge window closed' assertion fails when en messages are used", () => {
    withEn(<ChallengeCountdown challengeEndLedger={1000} isElapsed={true} />);
    expect(screen.queryByText("Ventana de desafío cerrada")).not.toBeInTheDocument();
  });

  it("Spanish co-sponsor plural assertion fails when en messages are used", () => {
    withEn(<CoSponsorsCountDisplay count={3} />);
    expect(screen.queryByText("3 co-patrocinadores")).not.toBeInTheDocument();
  });

  it("Spanish ShareButton aria-label assertion fails when en messages are used", () => {
    withEn(<ShareButton url="https://example.com" />);
    expect(screen.queryByRole("button", { name: "Compartir enlace de propuesta" })).not.toBeInTheDocument();
  });
});
