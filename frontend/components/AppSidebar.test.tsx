import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { GraphNode, PendingAction } from "@/lib/types";

import AppSidebar from "./AppSidebar";

const node = (id: string, cost: number | null): GraphNode => ({
  node_id: id,
  resource_type: "ec2",
  name: id,
  state: "running",
  tags: {},
  cost_7d: cost,
  last_metric_snapshot: null,
});

const pending: PendingAction = {
  id: "a1",
  agent_id: "cost",
  node_id: "ec2:i-1",
  tool_name: "stop_ec2_instance",
  params: { instance_id: "i-1" },
  proposed_reasoning: null,
  status: "pending",
  created_at: "2026-01-01T00:00:00",
  resolved_at: null,
  result: null,
};

describe("AppSidebar", () => {
  it("summarises resources, cost and pending approvals", () => {
    render(
      <AppSidebar
        nodes={{ "ec2:i-1": node("ec2:i-1", 10.4), "ec2:i-2": node("ec2:i-2", 20.2), "ec2:i-3": node("ec2:i-3", null) }}
        actions={{ a1: pending }}
        activity={[]}
        connection="live"
      />,
    );

    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("$31")).toBeInTheDocument();
    expect(screen.getByText("Live")).toBeInTheDocument();
    expect(screen.getByText("Approve")).toBeInTheDocument();
  });

  it("explains the empty approval queue and flags a dropped connection", () => {
    render(<AppSidebar nodes={{}} actions={{}} activity={[]} connection="closed" />);

    expect(screen.getByText(/nothing runs until you approve it/i)).toBeInTheDocument();
    expect(screen.getByText(/disconnected/i)).toBeInTheDocument();
  });

  it("says it is locked, not 'connecting', when the API needs a token", () => {
    render(<AppSidebar nodes={{}} actions={{}} activity={[]} connection="connecting" locked />);

    expect(screen.getByText(/Locked: enter the API token/)).toBeInTheDocument();
    expect(screen.queryByText("Connecting…")).not.toBeInTheDocument();
  });
});
