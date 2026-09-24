/**
 * Factory for `jest.mock("@nebgov/sdk", ...)`: keeps the real enums and types
 * but replaces every client the CLI constructs with a jest mock constructor.
 */
export function mockSdk(): Record<string, unknown> {
  const actual = jest.requireActual("@nebgov/sdk");
  return {
    ...actual,
    GovernorClient: jest.fn(),
    VotesClient: jest.fn(),
    TreasuryClient: jest.fn(),
    FactoryClient: jest.fn(),
    ProposalBondsClient: jest.fn(),
    OptimisticGovernorClient: jest.fn(),
    ConvictionVotingClient: jest.fn(),
    TreasuryStrategiesClient: jest.fn(),
    SignalingClient: jest.fn(),
  };
}

/** Make `ctor` return `methods` as its instance and hand the mocks back. */
export function stubClient<M extends Record<string, jest.Mock>>(ctor: unknown, methods: M): M {
  (ctor as jest.Mock).mockImplementation(() => methods);
  return methods;
}
