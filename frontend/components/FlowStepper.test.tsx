import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import FlowStepper from "./FlowStepper";

const props = { activeStep: "observe" as const, pendingCount: 0, canTrigger: true, onTrigger: vi.fn() };

describe("FlowStepper", () => {
  it("renders the five steps as buttons", () => {
    render(<FlowStepper {...props} />);
    for (const name of ["Observe", "Investigate", "Conclude", "Propose", "Approve"]) {
      expect(screen.getByRole("button", { name: new RegExp(name) })).toBeInTheDocument();
    }
  });

  it("pins a clicked step, shows its full explanation, and can return to live", () => {
    render(<FlowStepper {...props} />);

    fireEvent.click(screen.getByRole("button", { name: /Propose/ }));
    expect(screen.getByText(/never touches AWS|does not touch AWS|never touch AWS/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /full walkthrough/i })).toHaveAttribute("href", "#flow");

    fireEvent.click(screen.getByRole("button", { name: "Back to live" }));
    expect(screen.getByText(/A poller reads the account/)).toBeInTheDocument();
  });

  it("keeps the incident button available while following live", () => {
    const onTrigger = vi.fn();
    render(<FlowStepper {...props} onTrigger={onTrigger} />);
    fireEvent.click(screen.getByRole("button", { name: "Trigger an incident" }));
    expect(onTrigger).toHaveBeenCalled();
  });
});
