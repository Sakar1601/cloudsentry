import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PendingAction } from "@/lib/types";

import ActionCard from "./ActionCard";

const pendingAction: PendingAction = {
  id: "action-1",
  agent_id: "cost",
  node_id: "ec2:i-1",
  tool_name: "stop_ec2_instance",
  params: { instance_id: "i-1" },
  proposed_reasoning: "Idle for 14 hours.",
  status: "pending",
  created_at: "2026-09-14T00:00:00",
  resolved_at: null,
  result: null,
};

describe("ActionCard", () => {
  beforeEach(() => {
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({}) }) as Response);
  });

  it("posts to the approve endpoint when Approve is clicked", async () => {
    render(<ActionCard action={pendingAction} x={0} y={0} />);

    fireEvent.click(screen.getByText("Approve"));

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith("http://localhost:8000/actions/action-1/approve", {
        method: "POST",
      })
    );
  });

  it("posts to the reject endpoint when Reject is clicked", async () => {
    render(<ActionCard action={pendingAction} x={0} y={0} />);

    fireEvent.click(screen.getByText("Reject"));

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith("http://localhost:8000/actions/action-1/reject", {
        method: "POST",
      })
    );
  });

  it("disables both buttons while a request is in flight", async () => {
    let resolveFetch: (value: Response) => void = () => {};
    global.fetch = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        })
    );

    render(<ActionCard action={pendingAction} x={0} y={0} />);
    fireEvent.click(screen.getByText("Approve"));

    expect(screen.getByText("Approve")).toBeDisabled();
    expect(screen.getByText("Reject")).toBeDisabled();

    resolveFetch({ ok: true, json: async () => ({}) } as Response);
  });

  it("renders a resolved state with no buttons when status is not pending", () => {
    render(<ActionCard action={{ ...pendingAction, status: "approved" }} x={0} y={0} />);

    expect(screen.getByText("approved")).toBeInTheDocument();
    expect(screen.queryByText("Approve")).not.toBeInTheDocument();
  });
});
