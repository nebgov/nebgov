import { render, screen } from "@testing-library/react";
import { TopVotersTable } from "../TopVotersTable";

jest.mock("../AddressDisplay", () => ({ AddressDisplay: ({ address }: { address: string }) => <span>{address}</span> }));

describe("TopVotersTable", () => {
  const voters = [
    { rank: 1, voter: "GAAA", proposalsVoted: 4, totalWeightCast: 125n },
    { rank: 2, voter: "GBBB", proposalsVoted: 2, totalWeightCast: 75n },
  ];

  it("renders rankings, voter addresses, and bigint weights", () => {
    render(<TopVotersTable voters={voters} />);

    expect(screen.getByRole("heading", { name: "Top Voters" })).toBeInTheDocument();
    expect(screen.getByText("GAAA")).toBeInTheDocument();
    expect(screen.getByText("125")).toBeInTheDocument();
    expect(screen.getByText("75")).toBeInTheDocument();
  });

  it("shows the empty state when no votes have been recorded", () => {
    render(<TopVotersTable voters={[]} />);
    expect(screen.getByText("No votes recorded yet.")).toBeInTheDocument();
  });

  it("renders loading skeleton rows instead of stale data", () => {
    render(<TopVotersTable voters={voters} loading />);
    expect(screen.getAllByLabelText("Loading content")).toHaveLength(20);
    expect(screen.queryByText("GAAA")).not.toBeInTheDocument();
  });
});

