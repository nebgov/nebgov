import React from "react";
import renderer from "react-test-renderer";
import { ProposalState } from "@nebgov/sdk";
import { ProposalCard } from "../ProposalCard";

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useFormatter: () => ({ number: (n: number) => String(n) }),
}));

jest.mock("../../hooks/useGovernorConfig", () => ({
  useGovernorConfig: () => ({ divisor: 10_000_000 }),
}));

jest.mock("next/link", () => {
  const MockLink = ({ children, href }: any) => <a href={href}>{children}</a>;
  MockLink.displayName = "MockLink";
  return MockLink;
});

jest.mock("react-markdown", () => ({
  __esModule: true,
  default: ({ children }: { children: string }) => <span>{children}</span>,
}));

jest.mock("rehype-sanitize", () => {
  const mockPlugin = () => () => {};
  return { default: mockPlugin };
});

const BASE_PROPS = {
  id: 1n,
  description: "Transfer 1000 NEB to treasury",
  votesFor: 750_0000000n,
  votesAgainst: 250_0000000n,
};

const STATES: ProposalState[] = [
  ProposalState.Pending,
  ProposalState.Active,
  ProposalState.Succeeded,
  ProposalState.Defeated,
  ProposalState.Queued,
  ProposalState.Executed,
  ProposalState.Cancelled,
];

describe("ProposalCard", () => {
  it.each(STATES)("matches snapshot for state %s", (state) => {
    const tree = renderer
      .create(<ProposalCard {...BASE_PROPS} state={state} />)
      .toJSON();
    expect(tree).toMatchSnapshot();
  });

  it("matches snapshot with long description", () => {
    const tree = renderer
      .create(
        <ProposalCard
          {...BASE_PROPS}
          state={ProposalState.Active}
          description={"A".repeat(200)}
        />
      )
      .toJSON();
    expect(tree).toMatchSnapshot();
  });
});

// ─── i18n: proposal number translation ────────────────────────────────────────

import { render, screen } from "@testing-library/react";

// Override the global mock to supply real messages for specific tests.
let _locale = "en";
jest.mock("next-intl", () => {
  const enMsg = require("../../messages/en.json");
  const esMsg = require("../../messages/es.json");
  function interpolate(template: string, vars?: Record<string, unknown>): string {
    if (!vars) return template;
    return template.replace(/\{(\w+)\}/g, (_, k: string) =>
      vars[k] !== undefined ? String(vars[k]) : `{${k}}`
    );
  }
  return {
    useTranslations: (ns: string) => (key: string, vars?: Record<string, unknown>) => {
      const msgs = _locale === "es" ? esMsg : enMsg;
      const val = (msgs[ns] as Record<string, string>)?.[key];
      if (typeof val !== "string") return key;
      return interpolate(val, vars);
    },
    useFormatter: () => ({ number: (n: number) => String(n) }),
  };
});

describe("ProposalCard — i18n proposal number", () => {
  afterEach(() => { _locale = "en"; });

  it("renders English proposal number 'Proposal #1'", () => {
    _locale = "en";
    render(<ProposalCard {...BASE_PROPS} state={ProposalState.Active} />);
    expect(screen.getByText("Proposal #1")).toBeInTheDocument();
  });

  it("renders Spanish proposal number 'Propuesta #1'", () => {
    _locale = "es";
    render(<ProposalCard {...BASE_PROPS} state={ProposalState.Active} />);
    expect(screen.getByText("Propuesta #1")).toBeInTheDocument();
  });
});
