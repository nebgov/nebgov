import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AddressDisplay } from "../AddressDisplay";
import * as addressLabels from "../../lib/address-labels";

jest.mock("../../lib/address-labels", () => ({
  getAddressLabel: jest.fn(),
  setCustomLabel: jest.fn(),
  removeCustomLabel: jest.fn(),
  exportCustomLabels: jest.fn(),
  importCustomLabels: jest.fn(),
}));

const mockGetAddressLabel = addressLabels.getAddressLabel as jest.Mock;
const mockSetCustomLabel = addressLabels.setCustomLabel as jest.Mock;
const mockRemoveCustomLabel = addressLabels.removeCustomLabel as jest.Mock;
const mockExportCustomLabels = addressLabels.exportCustomLabels as jest.Mock;
const mockImportCustomLabels = addressLabels.importCustomLabels as jest.Mock;

const TEST_ADDRESS = "GBUQWP3BOUZX34TONNRUNYVM3HNV4FONT7JJLHG5RJVMFEASGQ353TS";

describe("AddressDisplay", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetAddressLabel.mockReturnValue(null);
    Object.assign(navigator, {
      clipboard: {
        writeText: jest.fn(() => Promise.resolve()),
      },
    });
    global.alert = jest.fn();
    global.prompt = jest.fn();
  });

  describe("rendering without label", () => {
    it("renders truncated address by default", () => {
      render(<AddressDisplay address={TEST_ADDRESS} />);
      expect(screen.getByText("GBUQWP...353TS")).toBeInTheDocument();
    });

    it("renders full address when truncate is false", () => {
      render(<AddressDisplay address={TEST_ADDRESS} truncate={false} />);
      expect(screen.getByText(TEST_ADDRESS)).toBeInTheDocument();
    });

    it("applies custom className", () => {
      const { container } = render(
        <AddressDisplay address={TEST_ADDRESS} className="custom-class" />
      );
      expect(container.querySelector(".custom-class")).toBeInTheDocument();
    });
  });

  describe("rendering with label", () => {
    it("displays label with truncated address in parentheses", () => {
      mockGetAddressLabel.mockReturnValue("My Wallet");
      render(<AddressDisplay address={TEST_ADDRESS} />);
      expect(screen.getByText("My Wallet")).toBeInTheDocument();
      expect(screen.getByText(/\(GBUQWP...353TS\)/)).toBeInTheDocument();
    });

    it("displays label with full address when truncate is false", () => {
      mockGetAddressLabel.mockReturnValue("My Wallet");
      render(<AddressDisplay address={TEST_ADDRESS} truncate={false} />);
      expect(screen.getByText("My Wallet")).toBeInTheDocument();
      expect(screen.getByText(new RegExp(`\\(${TEST_ADDRESS}\\)`))).toBeInTheDocument();
    });
  });

  describe("context menu interactions", () => {
    it("opens menu on right-click", () => {
      render(<AddressDisplay address={TEST_ADDRESS} />);
      const element = screen.getByText("GBUQWP...353TS");
      fireEvent.contextMenu(element);
      expect(screen.getByText("Export labels")).toBeInTheDocument();
    });

    it("closes menu on outside click", async () => {
      render(
        <div>
          <AddressDisplay address={TEST_ADDRESS} />
          <div data-testid="outside">Outside</div>
        </div>
      );
      const element = screen.getByText("GBUQWP...353TS");
      fireEvent.contextMenu(element);
      expect(screen.getByText("Export labels")).toBeInTheDocument();
      
      fireEvent.mouseDown(screen.getByTestId("outside"));
      await waitFor(() => {
        expect(screen.queryByText("Export labels")).not.toBeInTheDocument();
      });
    });

    it("toggles menu on repeated right-click", () => {
      render(<AddressDisplay address={TEST_ADDRESS} />);
      const element = screen.getByText("GBUQWP...353TS");
      
      fireEvent.contextMenu(element);
      expect(screen.getByText("Export labels")).toBeInTheDocument();
      
      fireEvent.contextMenu(element);
      expect(screen.queryByText("Export labels")).not.toBeInTheDocument();
    });
  });

  describe("label management without existing label", () => {
    it("saves new label when input is filled and button clicked", async () => {
      const user = userEvent.setup();
      render(<AddressDisplay address={TEST_ADDRESS} />);
      
      fireEvent.contextMenu(screen.getByText("GBUQWP...353TS"));
      const input = screen.getByPlaceholderText("Enter label...");
      await user.type(input, "New Wallet");
      
      const saveButton = screen.getByRole("button", { name: "Save Label" });
      fireEvent.click(saveButton);
      
      expect(mockSetCustomLabel).toHaveBeenCalledWith(TEST_ADDRESS, "New Wallet");
    });

    it("saves label when Enter key is pressed", async () => {
      const user = userEvent.setup();
      render(<AddressDisplay address={TEST_ADDRESS} />);
      
      fireEvent.contextMenu(screen.getByText("GBUQWP...353TS"));
      const input = screen.getByPlaceholderText("Enter label...");
      await user.type(input, "New Wallet{Enter}");
      
      expect(mockSetCustomLabel).toHaveBeenCalledWith(TEST_ADDRESS, "New Wallet");
    });

    it("disables save button when input is empty", () => {
      render(<AddressDisplay address={TEST_ADDRESS} />);
      fireEvent.contextMenu(screen.getByText("GBUQWP...353TS"));
      
      const saveButton = screen.getByRole("button", { name: "Save Label" });
      expect(saveButton).toBeDisabled();
    });

    it("disables save button when input is only whitespace", async () => {
      const user = userEvent.setup();
      render(<AddressDisplay address={TEST_ADDRESS} />);
      
      fireEvent.contextMenu(screen.getByText("GBUQWP...353TS"));
      const input = screen.getByPlaceholderText("Enter label...");
      await user.type(input, "   ");
      
      const saveButton = screen.getByRole("button", { name: "Save Label" });
      expect(saveButton).toBeDisabled();
    });

    it("closes menu after saving label", async () => {
      const user = userEvent.setup();
      render(<AddressDisplay address={TEST_ADDRESS} />);
      
      fireEvent.contextMenu(screen.getByText("GBUQWP...353TS"));
      const input = screen.getByPlaceholderText("Enter label...");
      await user.type(input, "New Wallet");
      
      fireEvent.click(screen.getByRole("button", { name: "Save Label" }));
      
      await waitFor(() => {
        expect(screen.queryByPlaceholderText("Enter label...")).not.toBeInTheDocument();
      });
    });
  });

  describe("label management with existing label", () => {
    beforeEach(() => {
      mockGetAddressLabel.mockReturnValue("Existing Label");
    });

    it("shows edit button with existing label name", () => {
      render(<AddressDisplay address={TEST_ADDRESS} />);
      fireEvent.contextMenu(screen.getByText(/Existing Label/));
      expect(screen.getByText('Edit label "Existing Label"')).toBeInTheDocument();
    });

    it("shows remove label button", () => {
      render(<AddressDisplay address={TEST_ADDRESS} />);
      fireEvent.contextMenu(screen.getByText(/Existing Label/));
      expect(screen.getByText("Remove label")).toBeInTheDocument();
    });

    it("removes label when remove button clicked", () => {
      render(<AddressDisplay address={TEST_ADDRESS} />);
      fireEvent.contextMenu(screen.getByText(/Existing Label/));
      fireEvent.click(screen.getByText("Remove label"));
      
      expect(mockRemoveCustomLabel).toHaveBeenCalledWith(TEST_ADDRESS);
    });

    it("closes menu after removing label", () => {
      render(<AddressDisplay address={TEST_ADDRESS} />);
      fireEvent.contextMenu(screen.getByText(/Existing Label/));
      fireEvent.click(screen.getByText("Remove label"));
      
      expect(screen.queryByText("Remove label")).not.toBeInTheDocument();
    });

    it("allows editing existing label", async () => {
      const user = userEvent.setup();
      render(<AddressDisplay address={TEST_ADDRESS} />);
      
      fireEvent.contextMenu(screen.getByText(/Existing Label/));
      fireEvent.click(screen.getByText('Edit label "Existing Label"'));
      
      // After clicking edit, menu should close
      await waitFor(() => {
        expect(screen.queryByText("Edit label")).not.toBeInTheDocument();
      });
    });
  });

  describe("export and import", () => {
    it("exports labels and copies to clipboard", async () => {
      mockExportCustomLabels.mockReturnValue('{"data":"exported"}');
      render(<AddressDisplay address={TEST_ADDRESS} />);
      
      fireEvent.contextMenu(screen.getByText("GBUQWP...353TS"));
      fireEvent.click(screen.getByText("Export labels"));
      
      expect(mockExportCustomLabels).toHaveBeenCalled();
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('{"data":"exported"}');
      expect(global.alert).toHaveBeenCalledWith("Labels exported to clipboard");
    });

    it("imports labels from prompt input", () => {
      mockImportCustomLabels.mockReturnValue(true);
      (global.prompt as jest.Mock).mockReturnValue('{"imported":"data"}');
      
      const reloadSpy = jest.fn();
      Object.defineProperty(window.location, "reload", {
        value: reloadSpy,
        writable: true,
      });
      
      render(<AddressDisplay address={TEST_ADDRESS} />);
      fireEvent.contextMenu(screen.getByText("GBUQWP...353TS"));
      fireEvent.click(screen.getByText("Import labels"));
      
      expect(global.prompt).toHaveBeenCalledWith("Paste exported labels JSON:");
      expect(mockImportCustomLabels).toHaveBeenCalledWith('{"imported":"data"}');
      expect(reloadSpy).toHaveBeenCalled();
    });

    it("handles invalid import data gracefully", () => {
      mockImportCustomLabels.mockReturnValue(false);
      (global.prompt as jest.Mock).mockReturnValue('invalid json');
      
      const reloadSpy = jest.fn();
      Object.defineProperty(window.location, "reload", {
        value: reloadSpy,
        writable: true,
      });
      
      render(<AddressDisplay address={TEST_ADDRESS} />);
      fireEvent.contextMenu(screen.getByText("GBUQWP...353TS"));
      fireEvent.click(screen.getByText("Import labels"));
      
      expect(reloadSpy).not.toHaveBeenCalled();
    });
  });

  describe("cleanup", () => {
    it("removes event listener on unmount", () => {
      const removeEventListenerSpy = jest.spyOn(document, "removeEventListener");
      const { unmount } = render(<AddressDisplay address={TEST_ADDRESS} />);
      
      unmount();
      
      expect(removeEventListenerSpy).toHaveBeenCalledWith("mousedown", expect.any(Function));
      removeEventListenerSpy.mockRestore();
    });
  });
});
