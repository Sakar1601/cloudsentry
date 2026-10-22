import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getToken } from "@/lib/auth";

import TokenGate from "./TokenGate";

describe("TokenGate", () => {
  beforeEach(() => window.sessionStorage.clear());

  it("will not submit an empty token", () => {
    render(<TokenGate />);
    expect(screen.getByRole("button", { name: "Unlock" })).toBeDisabled();
  });

  it("stores the token for the session and reloads", () => {
    const reload = vi.fn();
    Object.defineProperty(window, "location", { value: { ...window.location, reload }, writable: true });
    render(<TokenGate />);

    fireEvent.change(screen.getByLabelText("API token"), { target: { value: " s3cret " } });
    fireEvent.click(screen.getByRole("button", { name: "Unlock" }));

    expect(getToken()).toBe("s3cret");
    expect(reload).toHaveBeenCalled();
  });

  it("masks the token as it is typed", () => {
    render(<TokenGate />);
    expect(screen.getByLabelText("API token")).toHaveAttribute("type", "password");
  });
});
