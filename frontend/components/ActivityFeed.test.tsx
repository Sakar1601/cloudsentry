import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { ActivityItem, GraphNode, PendingAction } from "@/lib/types";

import ActivityFeed from "./ActivityFeed";

const nodes: Record<string, GraphNode> = {
  "ec2:i-1": {
    node_id: "ec2:i-1",
    resource_type: "ec2",
    name: "batch-worker",
    state: "running",
    tags: {},
    cost_7d: 10,
    last_metric_snapshot: null,
  },
};

const actions: Record<string, PendingAction> = {
  a1: {
    id: "a1",
    agent_id: "cost",
    node_id: "ec2:i-1",
    tool_name: "stop_ec2_instance",
    params: {},
    proposed_reasoning: null,
    status: "approved",
    created_at: "2026-01-01T00:00:00",
    resolved_at: null,
    result: null,
  },
};

const now = 1_000_000;

describe("ActivityFeed", () => {
  it("shows an empty state before any agent has reported", () => {
    render(<ActivityFeed items={[]} nodes={nodes} actions={actions} now={now} />);
    expect(screen.getByText(/agents are scanning the account/i)).toBeInTheDocument();
  });

  it("renders findings, proposals and resolutions with node names and relative time", () => {
    const items: ActivityItem[] = [
      { id: "3", kind: "resolved", actionId: "a1", status: "approved", at: now - 2000 },
      { id: "2", kind: "proposed", agentId: "cost", nodeId: "ec2:i-1", actionId: "a1", at: now - 30_000 },
      { id: "1", kind: "finding", agentId: "cost", nodeId: "ec2:i-1", text: "Spend is high.", at: now - 120_000 },
    ];
    render(<ActivityFeed items={items} nodes={nodes} actions={actions} now={now} />);

    expect(screen.getByText("Spend is high.")).toBeInTheDocument();
    expect(screen.getAllByText("batch-worker")).toHaveLength(3);
    expect(screen.getByText("Approved")).toBeInTheDocument();
    expect(screen.getByText("just now")).toBeInTheDocument();
    expect(screen.getByText("30s ago")).toBeInTheDocument();
    expect(screen.getByText("2m ago")).toBeInTheDocument();
  });
});
