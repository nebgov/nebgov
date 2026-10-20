import { act, fireEvent, render } from "@testing-library/react";
import { useFocusTrap } from "../useFocusTrap";

function Harness({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useFocusTrap<HTMLDivElement>(open, onClose);
  return (
    <div ref={ref} role="dialog" tabIndex={-1}>
      <button type="button">First</button>
      <button type="button">Last</button>
    </div>
  );
}

describe("useFocusTrap", () => {
  it("focuses the first control and closes on Escape", () => {
    const onClose = jest.fn();
    render(<Harness open onClose={onClose} />);
    expect(document.activeElement).toHaveTextContent("First");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("wraps Tab from the last control to the first", () => {
    const onClose = jest.fn();
    render(<Harness open onClose={onClose} />);
    const controls = Array.from(document.querySelectorAll("button"));
    controls.forEach((control) => Object.defineProperty(control, "offsetParent", { value: document.body }));
    act(() => controls[1].focus());
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(controls[0]);
  });

  it("restores focus when the trap closes", () => {
    const onClose = jest.fn();
    const trigger = document.createElement("button");
    trigger.textContent = "Open";
    document.body.appendChild(trigger);
    trigger.focus();
    const { rerender } = render(<Harness open onClose={onClose} />);
    rerender(<Harness open={false} onClose={onClose} />);
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });
});

