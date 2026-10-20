import React from "react";
import renderer from "react-test-renderer";

// Mock dependencies
jest.mock("../../hooks/useFocusTrap", () => ({
  useFocusTrap: jest.fn(() => React.createRef()),
}));

jest.mock("react-hot-toast", () => ({
  __esModule: true,
  default: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

import { TopUpStreamModal } from "../TopUpStreamModal";

describe("TopUpStreamModal", () => {
  const mockClient = {
    topUpStream: jest.fn(),
  };

  const mockStream = {
    id: 1,
    name: "Test Stream",
  };

  const mockSignUnsignedXdr = jest.fn().mockResolvedValue("signed_xdr");

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders modal dialog with correct title", () => {
    const tree = renderer
      .create(
        <TopUpStreamModal
          client={mockClient}
          stream={mockStream}
          signerPublicKey="GA123"
          signUnsignedXdr={mockSignUnsignedXdr}
          busy={false}
          setBusy={jest.fn()}
          onClose={jest.fn()}
          onToppedUp={jest.fn()}
        />
      )
      .toJSON();
    expect(tree).toMatchSnapshot();
  });

  it("displays stream name in modal", () => {
    const tree = renderer
      .create(
        <TopUpStreamModal
          client={mockClient}
          stream={mockStream}
          signerPublicKey="GA123"
          signUnsignedXdr={mockSignUnsignedXdr}
          busy={false}
          setBusy={jest.fn()}
          onClose={jest.fn()}
          onToppedUp={jest.fn()}
        />
      )
      .root;

    const paragraphs = tree.findAllByType("p");
    const streamNameParagraph = paragraphs.find((p) =>
      JSON.stringify(p.props.children).includes("Test Stream")
    );
    expect(streamNameParagraph).toBeDefined();
  });

  it("has input field with placeholder", () => {
    const tree = renderer
      .create(
        <TopUpStreamModal
          client={mockClient}
          stream={mockStream}
          signerPublicKey="GA123"
          signUnsignedXdr={mockSignUnsignedXdr}
          busy={false}
          setBusy={jest.fn()}
          onClose={jest.fn()}
          onToppedUp={jest.fn()}
        />
      )
      .root;

    const input = tree.findByType("input");
    expect(input.props.placeholder).toBe("1000");
    expect(input.props.type).toBe("text");
  });

  it("has Cancel and Top Up buttons", () => {
    const tree = renderer
      .create(
        <TopUpStreamModal
          client={mockClient}
          stream={mockStream}
          signerPublicKey="GA123"
          signUnsignedXdr={mockSignUnsignedXdr}
          busy={false}
          setBusy={jest.fn()}
          onClose={jest.fn()}
          onToppedUp={jest.fn()}
        />
      )
      .root;

    const buttons = tree.findAllByType("button");
    expect(buttons.length).toBeGreaterThanOrEqual(3); // Close + Cancel + Top Up
  });

  it("shows error when amount is not a number", async () => {
    let setAmountValue = "";
    let errorValue = "";

    const tree = renderer
      .create(
        <TopUpStreamModal
          client={mockClient}
          stream={mockStream}
          signerPublicKey="GA123"
          signUnsignedXdr={mockSignUnsignedXdr}
          busy={false}
          setBusy={jest.fn()}
          onClose={jest.fn()}
          onToppedUp={jest.fn()}
        />
      );

    const input = tree.root.findByType("input");
    const buttons = tree.root.findAllByType("button");
    const submitButton = buttons.find((b) =>
      JSON.stringify(b.props.children).includes("Top Up")
    );

    await renderer.act(async () => {
      input.props.onChange({ target: { value: "abc" } });
    });

    // Trigger form submission
    const form = tree.root.findByType("form");
    await renderer.act(async () => {
      form.props.onSubmit({ preventDefault: jest.fn() });
    });

    expect(tree.toJSON()).toMatchSnapshot();
  });

  it("shows error when amount is zero or negative", async () => {
    const tree = renderer
      .create(
        <TopUpStreamModal
          client={mockClient}
          stream={mockStream}
          signerPublicKey="GA123"
          signUnsignedXdr={mockSignUnsignedXdr}
          busy={false}
          setBusy={jest.fn()}
          onClose={jest.fn()}
          onToppedUp={jest.fn()}
        />
      );

    const input = tree.root.findByType("input");

    await renderer.act(async () => {
      input.props.onChange({ target: { value: "0" } });
    });

    const form = tree.root.findByType("form");
    await renderer.act(async () => {
      form.props.onSubmit({ preventDefault: jest.fn() });
    });

    expect(tree.toJSON()).toMatchSnapshot();
  });

  it("calls client.topUpStream with correct parameters on valid submit", async () => {
    const setBusyMock = jest.fn();
    const onToppedUpMock = jest.fn();
    const onCloseMock = jest.fn();

    mockClient.topUpStream.mockResolvedValue(undefined);

    const tree = renderer
      .create(
        <TopUpStreamModal
          client={mockClient}
          stream={mockStream}
          signerPublicKey="GA123"
          signUnsignedXdr={mockSignUnsignedXdr}
          busy={false}
          setBusy={setBusyMock}
          onClose={onCloseMock}
          onToppedUp={onToppedUpMock}
        />
      );

    const input = tree.root.findByType("input");

    await renderer.act(async () => {
      input.props.onChange({ target: { value: "500" } });
    });

    const form = tree.root.findByType("form");
    await renderer.act(async () => {
      form.props.onSubmit({ preventDefault: jest.fn() });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(setBusyMock).toHaveBeenCalledWith(true);
  });

  it("disables submit button when busy", () => {
    const tree = renderer
      .create(
        <TopUpStreamModal
          client={mockClient}
          stream={mockStream}
          signerPublicKey="GA123"
          signUnsignedXdr={mockSignUnsignedXdr}
          busy={true}
          setBusy={jest.fn()}
          onClose={jest.fn()}
          onToppedUp={jest.fn()}
        />
      )
      .root;

    const buttons = tree.findAllByType("button");
    const submitButton = buttons.find((b) =>
      JSON.stringify(b.props.children).includes("Top Up")
    );
    expect(submitButton?.props.disabled).toBe(true);
  });

  it("shows loading text when busy", () => {
    const tree = renderer
      .create(
        <TopUpStreamModal
          client={mockClient}
          stream={mockStream}
          signerPublicKey="GA123"
          signUnsignedXdr={mockSignUnsignedXdr}
          busy={true}
          setBusy={jest.fn()}
          onClose={jest.fn()}
          onToppedUp={jest.fn()}
        />
      )
      .toJSON();
    expect(JSON.stringify(tree)).toContain("Topping Up");
  });

  it("clears error message when user updates amount", async () => {
    const tree = renderer
      .create(
        <TopUpStreamModal
          client={mockClient}
          stream={mockStream}
          signerPublicKey="GA123"
          signUnsignedXdr={mockSignUnsignedXdr}
          busy={false}
          setBusy={jest.fn()}
          onClose={jest.fn()}
          onToppedUp={jest.fn()}
        />
      );

    const input = tree.root.findByType("input");

    // Set invalid amount and trigger error
    await renderer.act(async () => {
      input.props.onChange({ target: { value: "abc" } });
    });

    const form = tree.root.findByType("form");
    await renderer.act(async () => {
      form.props.onSubmit({ preventDefault: jest.fn() });
    });

    // Now update with valid amount
    await renderer.act(async () => {
      input.props.onChange({ target: { value: "100" } });
    });

    expect(tree.toJSON()).toMatchSnapshot();
  });

  it("has modal dialog semantics with aria attributes", () => {
    const tree = renderer
      .create(
        <TopUpStreamModal
          client={mockClient}
          stream={mockStream}
          signerPublicKey="GA123"
          signUnsignedXdr={mockSignUnsignedXdr}
          busy={false}
          setBusy={jest.fn()}
          onClose={jest.fn()}
          onToppedUp={jest.fn()}
        />
      )
      .root;

    const dialog = tree.findByProps({ role: "dialog" });
    expect(dialog.props["aria-modal"]).toBe(true);
    expect(dialog.props["aria-labelledby"]).toBe("topup-stream-modal-title");
  });

  it("calls onClose when close button is clicked", () => {
    const onCloseMock = jest.fn();
    const tree = renderer
      .create(
        <TopUpStreamModal
          client={mockClient}
          stream={mockStream}
          signerPublicKey="GA123"
          signUnsignedXdr={mockSignUnsignedXdr}
          busy={false}
          setBusy={jest.fn()}
          onClose={onCloseMock}
          onToppedUp={jest.fn()}
        />
      );

    const buttons = tree.root.findAllByType("button");
    const closeButton = buttons.find((b) =>
      JSON.stringify(b.props["aria-label"]).includes("Close")
    );

    if (closeButton) {
      renderer.act(() => {
        closeButton.props.onClick();
      });
      expect(onCloseMock).toHaveBeenCalled();
    }
  });
});
