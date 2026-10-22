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
