import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useGraphSocket } from "./useGraphSocket";

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  url: string;
  listeners: Record<string, ((event: { data: string }) => void)[]> = {};

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  addEventListener(type: string, handler: (event: { data: string }) => void) {
    this.listeners[type] = this.listeners[type] ?? [];
    this.listeners[type].push(handler);
  }

  close() {}

  emit(type: string, data: unknown) {
    for (const handler of this.listeners[type] ?? []) {
      handler({ data: JSON.stringify(data) });
    }
  }
}

describe("useGraphSocket", () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
    // @ts-expect-error test override of the global WebSocket constructor
    global.WebSocket = FakeWebSocket;
    global.fetch = vi.fn(async (url: string) => {
      if (url.endsWith("/graph")) {
        return {
          json: async () => ({
            nodes: {
              "ec2:i-1": {
                node_id: "ec2:i-1",
                resource_type: "ec2",
                name: "web",
                state: "running",
                tags: {},
                cost_7d: null,
                last_metric_snapshot: null,
              },
            },
            edges: [],
          }),
        } as Response;
      }
      if (url.endsWith("/actions")) {
        return { json: async () => [] } as Response;
      }
      throw new Error(`unexpected fetch ${url}`);
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("seeds state from GET /graph then applies node_added", async () => {
    const { result } = renderHook(() => useGraphSocket());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.nodes["ec2:i-1"].name).toBe("web");

    const socket = FakeWebSocket.instances[0];
    const newNode = {
      node_id: "lambda:fn",
      resource_type: "lambda",
      name: "fn",
      state: "active",
      tags: {},
      cost_7d: null,
      last_metric_snapshot: null,
    };

    act(() => {
      socket.emit("message", { type: "node_added", node: newNode });
    });

    await waitFor(() => expect(result.current.nodes["lambda:fn"]).toEqual(newNode));
  });

  it("applies node_removed", async () => {
    const { result } = renderHook(() => useGraphSocket());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const socket = FakeWebSocket.instances[0];
    act(() => {
      socket.emit("message", { type: "node_removed", node_id: "ec2:i-1" });
    });

    await waitFor(() => expect(result.current.nodes["ec2:i-1"]).toBeUndefined());
  });

  it("applies edge_added and edge_removed", async () => {
    const { result } = renderHook(() => useGraphSocket());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const socket = FakeWebSocket.instances[0];
    const edge = { source: "lambda:fn", target: "dynamodb:t", relation: "references" };

    act(() => {
      socket.emit("message", { type: "edge_added", edge });
    });
    await waitFor(() => expect(result.current.edges).toContainEqual(edge));

    act(() => {
      socket.emit("message", { type: "edge_removed", edge });
    });
    await waitFor(() => expect(result.current.edges).not.toContainEqual(edge));
  });

  it("applies agent_move and finding", async () => {
    const { result } = renderHook(() => useGraphSocket());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const socket = FakeWebSocket.instances[0];
    act(() => {
      socket.emit("message", { type: "agent_move", agent_id: "cost", target_node_id: "ec2:i-1" });
    });
    await waitFor(() => expect(result.current.agents.cost).toEqual({ targetNodeId: "ec2:i-1" }));

    act(() => {
      socket.emit("message", { type: "finding", agent_id: "cost", node_id: "ec2:i-1", text: "Idle instance." });
    });
    await waitFor(() =>
      expect(result.current.findings.cost).toEqual({ nodeId: "ec2:i-1", text: "Idle instance." })
    );
  });

  it("refetches actions on action_proposed and action_resolved", async () => {
    const pendingAction = {
      id: "action-1",
      agent_id: "cost",
      node_id: "ec2:i-1",
      tool_name: "stop_ec2_instance",
      params: { instance_id: "i-1" },
      proposed_reasoning: null,
      status: "pending",
      created_at: "2026-09-14T00:00:00",
      resolved_at: null,
      result: null,
    };

    global.fetch = vi.fn(async (url: string) => {
      if (url.endsWith("/graph")) {
        return { json: async () => ({ nodes: {}, edges: [] }) } as Response;
      }
      if (url.endsWith("/actions")) {
        return { json: async () => [pendingAction] } as Response;
      }
      throw new Error(`unexpected fetch ${url}`);
    }) as unknown as typeof fetch;

    const { result } = renderHook(() => useGraphSocket());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const socket = FakeWebSocket.instances[0];
    act(() => {
      socket.emit("message", {
        type: "action_proposed",
        agent_id: "cost",
        node_id: "ec2:i-1",
        action_id: "action-1",
      });
    });

    await waitFor(() => expect(result.current.actions["action-1"]).toEqual(pendingAction));
  });
});
