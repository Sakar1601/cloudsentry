import { render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/useGraphSocket", () => ({
  useGraphSocket: vi.fn(),
}));

vi.mock("@/components/GraphCanvas", () => ({
  default: vi.fn(({ onNodePositions }: any) => {
    // Mirrors the real component: positions are only ever reported from an
    // effect/animation-frame callback, never synchronously during render —
    // calling the parent's state setter mid-render here caused an infinite
    // re-render loop (and a worker crash) when this was inlined directly.
    useEffect(() => {
      onNodePositions?.({ "ec2:i-1": { x: 100, y: 50 } });
    }, [onNodePositions]);
    return <div data-testid="graph-canvas-mock" />;
  }),
}));

import { useGraphSocket } from "@/lib/useGraphSocket";

import Home from "./page";

describe("Home page", () => {
  it("renders a loading state while the initial fetch is in flight", () => {
    (useGraphSocket as ReturnType<typeof vi.fn>).mockReturnValue({
      nodes: {},
      edges: [],
      agents: {},
      findings: {},
      actions: {},
      loading: true,
    });

    render(<Home />);

    expect(screen.getByText("Loading graph…")).toBeInTheDocument();
  });

  it("renders an empty state when there are no nodes", () => {
    (useGraphSocket as ReturnType<typeof vi.fn>).mockReturnValue({
      nodes: {},
      edges: [],
      agents: {},
      findings: {},
      actions: {},
      loading: false,
    });

    render(<Home />);

    expect(screen.getByText("No resources found in this account yet.")).toBeInTheDocument();
  });

  it("renders the graph, an agent icon, its finding, and a pending action card", () => {
    (useGraphSocket as ReturnType<typeof vi.fn>).mockReturnValue({
      nodes: {
        "ec2:i-1": {
          node_id: "ec2:i-1",
          resource_type: "ec2",
          name: "web",
          state: "running",
          tags: {},
          cost_7d: 10,
          last_metric_snapshot: null,
        },
      },
      edges: [],
      agents: { cost: { targetNodeId: "ec2:i-1" } },
      findings: { cost: { nodeId: "ec2:i-1", text: "Idle instance." } },
      actions: {
        "action-1": {
          id: "action-1",
          agent_id: "cost",
          node_id: "ec2:i-1",
          tool_name: "stop_ec2_instance",
          params: {},
          proposed_reasoning: null,
          status: "pending",
          created_at: "2026-09-14T00:00:00",
          resolved_at: null,
          result: null,
        },
      },
      loading: false,
    });

    render(<Home />);

    expect(screen.getByTestId("graph-canvas-mock")).toBeInTheDocument();
    expect(screen.getByTestId("agent-icon-cost")).toBeInTheDocument();
    expect(screen.getByTestId("finding-bubble-cost")).toBeInTheDocument();
    expect(screen.getByTestId("action-card-action-1")).toBeInTheDocument();
  });
});
