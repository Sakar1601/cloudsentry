import { render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const mockForceGraph2D = vi.fn((_props: any) => <div data-testid="force-graph-mock" />);

vi.mock("react-force-graph-2d", () => ({
  default: mockForceGraph2D,
}));

import type { GraphNode } from "@/lib/types";
import GraphCanvas from "./GraphCanvas";

describe("GraphCanvas", () => {
  it("passes mapped graphData to react-force-graph-2d", async () => {
    const nodes: Record<string, GraphNode> = {
      "ec2:i-1": {
        node_id: "ec2:i-1",
        resource_type: "ec2",
        name: "web",
        state: "running",
        tags: {},
        cost_7d: 10,
        last_metric_snapshot: null,
      },
    };
    const edges = [{ source: "ec2:i-1", target: "ec2:i-2", relation: "same_vpc" }];

    render(<GraphCanvas nodes={nodes} edges={edges} />);

    // GraphCanvas loads react-force-graph-2d via next/dynamic (ssr: false),
    // which resolves asynchronously even under a mock.
    await waitFor(() => expect(mockForceGraph2D).toHaveBeenCalled());

    const call = mockForceGraph2D.mock.calls[0][0];
    expect(call.graphData.nodes).toEqual([
      { id: "ec2:i-1", resourceType: "ec2", name: "web", color: "#4f8fd1", val: expect.any(Number) },
    ]);
    expect(call.graphData.links).toEqual([
      { source: "ec2:i-1", target: "ec2:i-2", relation: "same_vpc" },
    ]);
  });
});
