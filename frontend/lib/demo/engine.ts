// In-browser stand-in for the Cloudsentry backend, used by the static demo
// build (NEXT_PUBLIC_STATIC_DEMO=1). It mirrors backend/app/demo/: a fictional
// AWS account whose metrics drift and spike, three scripted agents that pick
// nodes the same way the real ones do, and an in-memory action store. It emits
// the same message shapes the real WebSocket does, so the UI is unchanged.

import type { GraphEdge, GraphNode, PendingAction } from "../types";

type Listener = (message: any) => void;

const NODES: [string, string, string, string, Record<string, string>, number, number][] = [
  ["ec2:i-0a1b2c3d4e5f60001", "ec2", "api-server-1", "running", { Name: "api-server-1", env: "prod" }, 18.4, 34],
  ["ec2:i-0a1b2c3d4e5f60002", "ec2", "api-server-2", "running", { Name: "api-server-2", env: "prod" }, 18.4, 31],
  ["ec2:i-0a1b2c3d4e5f60003", "ec2", "batch-worker", "running", { Name: "batch-worker", env: "prod" }, 41.2, 12],
  ["ec2:i-0a1b2c3d4e5f60004", "ec2", "legacy-bastion", "running", { Name: "legacy-bastion", env: "dev" }, 9.7, 1.5],
  ["lambda:order-processor", "lambda", "order-processor", "active", {}, 3.1, 220],
  ["lambda:image-resizer", "lambda", "image-resizer", "active", {}, 1.8, 640],
  ["lambda:notify-user", "lambda", "notify-user", "active", {}, 0.4, 95],
  ["dynamodb:orders", "dynamodb", "orders", "ACTIVE", {}, 5.6, 410],
  ["dynamodb:sessions", "dynamodb", "sessions", "ACTIVE", {}, 2.2, 150],
];

const EDGES: [string, string, string][] = [
  ["ec2:i-0a1b2c3d4e5f60001", "ec2:i-0a1b2c3d4e5f60002", "same_vpc"],
  ["ec2:i-0a1b2c3d4e5f60001", "ec2:i-0a1b2c3d4e5f60003", "same_vpc"],
  ["ec2:i-0a1b2c3d4e5f60002", "ec2:i-0a1b2c3d4e5f60003", "same_vpc"],
  ["ec2:i-0a1b2c3d4e5f60003", "ec2:i-0a1b2c3d4e5f60004", "same_vpc"],
  ["lambda:order-processor", "dynamodb:orders", "references"],
  ["lambda:order-processor", "dynamodb:orders", "iam_access"],
  ["lambda:notify-user", "dynamodb:sessions", "references"],
  ["lambda:notify-user", "dynamodb:sessions", "iam_access"],
  ["lambda:image-resizer", "dynamodb:orders", "iam_access"],
];

const SPIKY_COST = new Set(["ec2:i-0a1b2c3d4e5f60003"]);
const SPIKY_METRIC = new Set(["ec2:i-0a1b2c3d4e5f60001", "lambda:image-resizer"]);
const SPIKE_EVERY = 4;
const THRESHOLD_FACTOR = 1.5;
const MAX_HISTORY = 5;

const POLL_MS = 5000;
const AGENT_MS = 10000;
const AGENT_OFFSETS_MS: Record<string, number> = { cost: 1500, performance: 4500, security: 7500 };

const FINDINGS: Record<string, (n: GraphNode) => string> = {
  cost: (n) =>
    `Spend on ${n.name} is running well above its recent baseline ($${(n.cost_7d ?? 0).toFixed(2)} over 7 days). ` +
    "Utilisation does not justify it; this looks like spend that should be reviewed or stopped.",
  performance: (n) =>
    `${n.name} shows a sustained spike versus its recent average (${Math.round(
      n.last_metric_snapshot?.value ?? 0,
    )} on its primary metric). The workload looks under-provisioned for current traffic; a larger size would remove the pressure.`,
  security: (n) =>
    `${n.name}'s execution role grants broader access than its code uses (wildcard resource on its data-plane actions). ` +
    "I'd narrow it to the specific tables it actually touches.",
};

const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);

export class DemoEngine {
  private listeners = new Set<Listener>();
  private nodes: Record<string, GraphNode> = {};
  private edges: GraphEdge[] = EDGES.map(([source, target, relation]) => ({ source, target, relation }));
  private actions: PendingAction[] = [];
  private builds = 0;
  private incidents = 0;
  /** Effects of approved actions, re-applied on every rebuild so they persist. */
  private effects: Record<string, { stopped?: boolean; resized?: string; tightened?: boolean }> = {};
  private history: Record<string, Record<string, number[]>> = { cost: {}, performance: {}, security: {} };
  private proposed = new Set<string>();
  private timers: ReturnType<typeof setTimeout>[] = [];
  private seq = 0;
  private running = false;

  constructor() {
    this.nodes = this.build();
  }

  getGraph() {
    return { nodes: this.nodes, edges: this.edges };
  }

  getActions(): PendingAction[] {
    return this.actions.map((a) => ({ ...a })).sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  resolve(id: string, decision: "approve" | "reject"): PendingAction {
    const action = this.actions.find((a) => a.id === id);
    if (!action) throw new Error("Action not found");
    if (action.status !== "pending") throw new Error(`Action already ${action.status}`);
    action.status = decision === "approve" ? "approved" : "rejected";
    if (decision === "approve") this.applyEffect(action);
    action.resolved_at = new Date().toISOString();
    action.result =
      decision === "approve"
        ? { success: true, result: { simulated: true, action: action.tool_name, ...action.params } }
        : null;
    this.emit({ type: "action_resolved", action_id: id, status: action.status });
    return action;
  }

  /**
   * Spike cost and latency right now and send each agent to a node, so a
   * visitor sees a full detect → investigate → propose cycle immediately
   * instead of waiting for the next scheduled spike.
   */
  triggerIncident(): void {
    this.pollOnce(true);
    const lambdas = Object.values(this.nodes)
      .filter((n) => n.resource_type === "lambda")
      .map((n) => n.node_id)
      .sort();
    const security = lambdas[this.incidents % lambdas.length];
    const performance = this.incidents % 2 === 0 ? "ec2:i-0a1b2c3d4e5f60001" : "ec2:i-0a1b2c3d4e5f60002";
    this.incidents += 1;
    this.later(0, () => this.runAgent("cost", "ec2:i-0a1b2c3d4e5f60003"));
    this.later(1400, () => this.runAgent("performance", performance));
    this.later(2800, () => this.runAgent("security", security));
  }

  /** An approved action changes the simulated account, like the real executor would. */
  private applyEffect(action: PendingAction) {
    const effect = (this.effects[action.node_id] ??= {});
    if (action.tool_name === "stop_ec2_instance") effect.stopped = true;
    if (action.tool_name === "resize_ec2_instance") effect.resized = String(action.params.new_instance_type);
    if (action.tool_name === "tighten_iam_policy") effect.tightened = true;
    this.pollOnce();
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    this.start();
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) this.stop();
    };
  }

  private emit(message: any) {
    this.listeners.forEach((l) => l(message));
  }

  private later(ms: number, fn: () => void) {
    this.timers.push(setTimeout(fn, ms));
  }

  private start() {
    if (this.running) return;
    this.running = true;
    const poll = () => {
      this.pollOnce();
      this.later(POLL_MS, poll);
    };
    this.later(POLL_MS, poll);
    for (const agent of Object.keys(AGENT_OFFSETS_MS)) {
      const cycle = () => {
        this.runAgent(agent);
        this.later(AGENT_MS, cycle);
      };
      this.later(AGENT_OFFSETS_MS[agent], cycle);
    }
  }

  private stop() {
    this.running = false;
    this.timers.forEach(clearTimeout);
    this.timers = [];
  }

  private build(forceSpike = false): Record<string, GraphNode> {
    this.builds += 1;
    const spike = forceSpike || this.builds % SPIKE_EVERY === 0;
    const now = new Date().toISOString();
    const nodes: Record<string, GraphNode> = {};
    for (const [id, type, name, state, tags, baseCost, baseMetric] of NODES) {
      const effect = this.effects[id] ?? {};
      let cost = baseCost * rand(0.97, 1.03);
      let metric = baseMetric * rand(0.9, 1.1);
      const stopped = effect.stopped === true;
      if (!stopped && spike && SPIKY_COST.has(id)) cost *= 2.2;
      if (!stopped && spike && SPIKY_METRIC.has(id)) metric *= effect.resized ? 1.2 : 2.6;
      if (stopped) {
        cost *= 0.08; // a stopped instance only pays for its volumes
        metric = 0;
      } else if (effect.resized) {
        metric *= 0.45; // the same load on a larger instance
      }
      const nodeTags = { ...tags };
      if (effect.resized) nodeTags.InstanceType = effect.resized;
      if (effect.tightened) nodeTags.IamPolicy = "scoped";
      nodes[id] = {
        node_id: id,
        resource_type: type,
        name,
        state: stopped ? "stopped" : state,
        tags: nodeTags,
        cost_7d: Math.round(cost * 100) / 100,
        last_metric_snapshot: { timestamp: now, value: Math.round(metric * 100) / 100 },
      };
    }
    return nodes;
  }

  private pollOnce(forceSpike = false) {
    this.nodes = this.build(forceSpike);
    for (const node of Object.values(this.nodes)) this.emit({ type: "node_updated", node });
  }

  private pickAboveBaseline(agent: string, value: (n: GraphNode) => number | null): string | null {
    const history = this.history[agent];
    let selected: string | null = null;
    for (const [id, node] of Object.entries(this.nodes)) {
      const v = value(node);
      if (v === null) continue;
      const past = (history[id] ??= []);
      if (selected === null && past.length) {
        const baseline = past.reduce((a, b) => a + b, 0) / past.length;
        if (baseline > 0 && v > baseline * THRESHOLD_FACTOR) selected = id;
      }
      past.push(v);
      if (past.length > MAX_HISTORY) past.shift();
    }
    return selected;
  }

  private select(agent: string): string | null {
    if (agent === "cost") return this.pickAboveBaseline(agent, (n) => n.cost_7d);
    if (agent === "performance") return this.pickAboveBaseline(agent, (n) => n.last_metric_snapshot?.value ?? null);
    const lambdas = Object.values(this.nodes)
      .filter((n) => n.resource_type === "lambda")
      .map((n) => n.node_id)
      .sort();
    const cursor = (this.history.security.cursor?.[0] ?? 0) % lambdas.length;
    this.history.security.cursor = [cursor + 1];
    return lambdas[cursor];
  }

  private runAgent(agent: string, forcedNodeId?: string) {
    const nodeId = forcedNodeId ?? this.select(agent);
    if (!nodeId) return;
    const node = this.nodes[nodeId];
    this.emit({ type: "agent_move", agent_id: agent, target_node_id: nodeId });

    this.later(rand(2000, 4000), () => {
      const text = FINDINGS[agent](node);
      const action = this.maybePropose(agent, node, text, forcedNodeId !== undefined);
      if (action) this.emit({ type: "action_proposed", agent_id: agent, node_id: nodeId, action_id: action.id });
      this.emit({ type: "finding", agent_id: agent, node_id: nodeId, text });
    });
  }

  private maybePropose(agent: string, node: GraphNode, reasoning: string, force = false): PendingAction | null {
    const key = `${agent}|${node.node_id}`;
    if (force) {
      if (this.actions.some((a) => a.status === "pending" && a.agent_id === agent && a.node_id === node.node_id)) return null;
    } else if (this.proposed.has(key)) {
      return null;
    }
    const instanceId = node.node_id.split(":")[1];
    let tool: string | null = null;
    let params: Record<string, unknown> = {};
    if (node.resource_type === "ec2" && node.state !== "running") return null;
    if (agent === "cost" && node.resource_type === "ec2") {
      tool = "stop_ec2_instance";
      params = { instance_id: instanceId };
    } else if (agent === "performance" && node.resource_type === "ec2") {
      tool = "resize_ec2_instance";
      params = { instance_id: instanceId, new_instance_type: "m5.xlarge" };
    } else if (agent === "security" && node.resource_type === "lambda") {
      tool = "tighten_iam_policy";
      params = {
        role_name: `${node.name}-role`,
        policy_name: `${node.name}-data-access`,
        new_policy_document: {
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Action: ["dynamodb:GetItem", "dynamodb:PutItem"],
              Resource: "arn:aws:dynamodb:us-east-1:123456789012:table/orders",
            },
          ],
        },
      };
    }
    if (!tool) return null;
    this.proposed.add(key);
    const action: PendingAction = {
      id: `demo-${++this.seq}-${Date.now().toString(36)}`,
      agent_id: agent,
      node_id: node.node_id,
      tool_name: tool,
      params,
      proposed_reasoning: reasoning,
      status: "pending",
      created_at: new Date().toISOString(),
      resolved_at: null,
      result: null,
    };
    this.actions.push(action);
    return action;
  }
}

const GLOBAL_KEY = "__cloudsentryDemoEngine";
export function getDemoEngine(): DemoEngine {
  const g = globalThis as any;
  return (g[GLOBAL_KEY] ??= new DemoEngine());
}
