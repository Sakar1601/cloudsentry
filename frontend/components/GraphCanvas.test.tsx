import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-force-graph-2d", () => ({
  default: vi.fn(() => <div data-testid="force-graph-mock" />),
}));

import ForceGraph2D from "react-force-graph-2d";

import type { GraphNode } from "@/lib/types";
import GraphCanvas from "./GraphCanvas";

describe("GraphCanvas", () => {
  it("passes mapped graphData to react-force-graph-2d", () => {
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

    const call = (ForceGraph2D as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.graphData.nodes).toEqual([
      { id: "ec2:i-1", resourceType: "ec2", name: "web", color: "#f59e0b", val: expect.any(Number) },
    ]);
    expect(call.graphData.links).toEqual([
      { source: "ec2:i-1", target: "ec2:i-2", relation: "same_vpc" },
    ]);
  });
});
