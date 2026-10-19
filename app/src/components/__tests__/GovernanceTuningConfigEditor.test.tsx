/**
 * @jest-environment jsdom
 */

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { GovernanceTuningConfigEditor } from "../GovernanceTuningConfigEditor";
import type { TuningConfig } from "@nebgov/sdk";

const baseConfig: TuningConfig = {
  minQuorumNumerator: 4,
  maxQuorumNumerator: 20,
  maxQuorumDeltaBps: 500,
  minProposalThreshold: 1000n,
  maxProposalThreshold: 5000n,
  maxThresholdDeltaBps: 300,
  trailingWindow: 10,
  intervalMs: 60000,
  autoPropose: false,
  updatedAt: new Date("2024-01-01"),
};

describe("GovernanceTuningConfigEditor", () => {
  it("renders all fields with current config values", () => {
    render(<GovernanceTuningConfigEditor config={baseConfig} onUpdate={jest.fn()} />);

    expect(screen.getByDisplayValue("4")).toBeInTheDocument();
    expect(screen.getByDisplayValue("20")).toBeInTheDocument();
    expect(screen.getByDisplayValue("500")).toBeInTheDocument();
    expect(screen.getByDisplayValue("1000")).toBeInTheDocument();
    expect(screen.getByDisplayValue("5000")).toBeInTheDocument();
    expect(screen.getByDisplayValue("300")).toBeInTheDocument();
    expect(screen.getByDisplayValue("10")).toBeInTheDocument();
    expect(screen.getByDisplayValue("60000")).toBeInTheDocument();
  });

  it("renders save button", () => {
    render(<GovernanceTuningConfigEditor config={baseConfig} onUpdate={jest.fn()} />);
    expect(screen.getByRole("button", { name: "Save Config" })).toBeInTheDocument();
  });

  it("renders auto-propose checkbox unchecked when false", () => {
    render(<GovernanceTuningConfigEditor config={baseConfig} onUpdate={jest.fn()} />);
    const checkbox = screen.getByRole("checkbox");
    expect(checkbox).not.toBeChecked();
  });

  it("renders auto-propose checkbox checked when true", () => {
    render(
      <GovernanceTuningConfigEditor
        config={{ ...baseConfig, autoPropose: true }}
        onUpdate={jest.fn()}
      />
    );
    expect(screen.getByRole("checkbox")).toBeChecked();
  });

  it("renders empty max threshold when null", () => {
    render(
      <GovernanceTuningConfigEditor
        config={{ ...baseConfig, maxProposalThreshold: null }}
        onUpdate={jest.fn()}
      />
    );
    const inputs = screen.getAllByRole("textbox");
    const maxThresholdInput = inputs.find(
      (i) => (i as HTMLInputElement).placeholder === "No limit"
    );
    expect((maxThresholdInput as HTMLInputElement).value).toBe("");
  });

  it("calls onUpdate with current values on submit", async () => {
    const onUpdate = jest.fn().mockResolvedValue(undefined);
    render(<GovernanceTuningConfigEditor config={baseConfig} onUpdate={onUpdate} />);

    fireEvent.click(screen.getByRole("button", { name: "Save Config" }));

    await waitFor(() => {
      expect(onUpdate).toHaveBeenCalledWith({
        minQuorumNumerator: 4,
        maxQuorumNumerator: 20,
        maxQuorumDeltaBps: 500,
        minProposalThreshold: 1000n,
        maxProposalThreshold: 5000n,
        maxThresholdDeltaBps: 300,
        trailingWindow: 10,
        intervalMs: 60000,
        autoPropose: false,
      });
    });
  });

  it("shows success message after successful save", async () => {
    const onUpdate = jest.fn().mockResolvedValue(undefined);
    render(<GovernanceTuningConfigEditor config={baseConfig} onUpdate={onUpdate} />);

    fireEvent.click(screen.getByRole("button", { name: "Save Config" }));

    await waitFor(() => {
      expect(screen.getByText("Config updated successfully.")).toBeInTheDocument();
    });
  });

  it("shows error message when onUpdate rejects", async () => {
    const onUpdate = jest.fn().mockRejectedValue(new Error("Network error"));
    render(<GovernanceTuningConfigEditor config={baseConfig} onUpdate={onUpdate} />);

    fireEvent.click(screen.getByRole("button", { name: "Save Config" }));

    await waitFor(() => {
      expect(screen.getByText("Network error")).toBeInTheDocument();
    });
  });

  it("shows generic error message for non-Error rejections", async () => {
    const onUpdate = jest.fn().mockRejectedValue("something went wrong");
    render(<GovernanceTuningConfigEditor config={baseConfig} onUpdate={onUpdate} />);

    fireEvent.click(screen.getByRole("button", { name: "Save Config" }));

    await waitFor(() => {
      expect(screen.getByText("Failed to update config")).toBeInTheDocument();
    });
  });

  it("disables button while submitting", async () => {
    let resolve!: () => void;
    const onUpdate = jest.fn(
      () => new Promise<void>((res) => { resolve = res; })
    );
    render(<GovernanceTuningConfigEditor config={baseConfig} onUpdate={onUpdate} />);

    fireEvent.click(screen.getByRole("button", { name: "Save Config" }));

    expect(screen.getByRole("button", { name: "Saving..." })).toBeDisabled();

    resolve();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Save Config" })).not.toBeDisabled();
    });
  });

  it("updates field values on user input", () => {
    render(<GovernanceTuningConfigEditor config={baseConfig} onUpdate={jest.fn()} />);

    const minQuorum = screen.getByDisplayValue("4");
    fireEvent.change(minQuorum, { target: { value: "8" } });
    expect(screen.getByDisplayValue("8")).toBeInTheDocument();
  });

  it("toggles auto-propose on checkbox change", () => {
    render(<GovernanceTuningConfigEditor config={baseConfig} onUpdate={jest.fn()} />);

    const checkbox = screen.getByRole("checkbox");
    fireEvent.click(checkbox);
    expect(checkbox).toBeChecked();
  });

  it("passes null max threshold when field is empty", async () => {
    const onUpdate = jest.fn().mockResolvedValue(undefined);
    render(
      <GovernanceTuningConfigEditor
        config={{ ...baseConfig, maxProposalThreshold: null }}
        onUpdate={onUpdate}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Save Config" }));

    await waitFor(() => {
      expect(onUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ maxProposalThreshold: null })
      );
    });
  });
});
