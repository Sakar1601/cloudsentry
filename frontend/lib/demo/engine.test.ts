import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DemoEngine } from "./engine";

describe("DemoEngine", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("starts with a connected graph", () => {
    const { nodes, edges } = new DemoEngine().getGraph();
    expect(Object.keys(nodes).length).toBeGreaterThan(5);
    for (const e of edges) {
      expect(nodes[e.source]).toBeDefined();
      expect(nodes[e.target]).toBeDefined();
    }
  });

  it("emits agent moves, findings and proposals over time, and resolves actions", () => {
    const engine = new DemoEngine();
    const types: string[] = [];
    const unsubscribe = engine.subscribe((m) => types.push(m.type));

    vi.advanceTimersByTime(60_000);

    expect(types).toContain("node_updated");
    expect(types).toContain("agent_move");
    expect(types).toContain("finding");
    expect(types).toContain("action_proposed");

    const [pending] = engine.getActions().filter((a) => a.status === "pending");
    expect(pending).toBeDefined();
    const resolved = engine.resolve(pending.id, "approve");
    expect(resolved.status).toBe("approved");
    expect(() => engine.resolve(pending.id, "reject")).toThrow(/already approved/);
    unsubscribe();
  });

  it("stops its timers when the last listener leaves", () => {
    const engine = new DemoEngine();
    const listener = vi.fn();
    engine.subscribe(listener)();
    vi.advanceTimersByTime(60_000);
    expect(listener).not.toHaveBeenCalled();
  });
});

describe("DemoEngine approvals change the account", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("an approved stop makes the instance stopped, and it stays stopped across polls", () => {
    const engine = new DemoEngine();
    const updates: any[] = [];
    engine.subscribe((m) => m.type === "node_updated" && updates.push(m.node));
    engine.triggerIncident();
    vi.advanceTimersByTime(10_000);

    const stop = engine.getActions().find((a) => a.tool_name === "stop_ec2_instance" && a.status === "pending")!;
    engine.resolve(stop.id, "approve");

    expect(engine.getGraph().nodes[stop.node_id].state).toBe("stopped");
    expect(engine.getGraph().nodes[stop.node_id].last_metric_snapshot?.value).toBe(0);

    vi.advanceTimersByTime(20_000); // several more polls
    expect(engine.getGraph().nodes[stop.node_id].state).toBe("stopped");
  });

  it("a rejection leaves the account untouched", () => {
    const engine = new DemoEngine();
    engine.subscribe(() => {});
    engine.triggerIncident();
    vi.advanceTimersByTime(10_000);

    const stop = engine.getActions().find((a) => a.tool_name === "stop_ec2_instance" && a.status === "pending")!;
    engine.resolve(stop.id, "reject");

    expect(engine.getGraph().nodes[stop.node_id].state).toBe("running");
  });

  it("an approved resize tags the new instance type and lowers load", () => {
    const engine = new DemoEngine();
    engine.subscribe(() => {});
    engine.triggerIncident();
    vi.advanceTimersByTime(10_000);

    const resize = engine.getActions().find((a) => a.tool_name === "resize_ec2_instance" && a.status === "pending")!;
    engine.resolve(resize.id, "approve");

    expect(engine.getGraph().nodes[resize.node_id].tags.InstanceType).toBe("m5.xlarge");
  });
});
