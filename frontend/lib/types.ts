export interface GraphNode {
  node_id: string;
  resource_type: string;
  name: string;
  state: string;
  tags: Record<string, string>;
  cost_7d: number | null;
  last_metric_snapshot: { timestamp: string; value: number } | null;
}

export interface GraphEdge {
  source: string;
  target: string;
  relation: string;
}

export interface PendingAction {
  id: string;
  agent_id: string;
  node_id: string;
  tool_name: string;
  params: Record<string, unknown>;
  proposed_reasoning: string | null;
  status: string;
  created_at: string;
  resolved_at: string | null;
  result: { success: boolean; result?: unknown; error?: string } | null;
}

export interface AgentMoveState {
  targetNodeId: string;
}

export interface FindingState {
  nodeId: string;
  text: string;
}

export interface LastEvent {
  type: string;
  agentId?: string;
  nodeId?: string;
  at: number;
}

export interface ActivityItem {
  id: string;
  kind: "finding" | "proposed" | "resolved";
  agentId?: string;
  nodeId?: string;
  actionId?: string;
  text?: string;
  status?: string;
  at: number;
}

export type ConnectionStatus = "connecting" | "live" | "closed";

export interface GraphSocketState {
  nodes: Record<string, GraphNode>;
  edges: GraphEdge[];
  agents: Record<string, AgentMoveState>;
  findings: Record<string, FindingState>;
  actions: Record<string, PendingAction>;
  loading: boolean;
  /** Most recent agent-lifecycle event (move, finding, proposal, resolution). */
  lastEvent?: LastEvent | null;
  /** Newest-first log of findings, proposals and resolutions (capped). */
  activity?: ActivityItem[];
  connection?: ConnectionStatus;
  /** The API answered 401: the operator must enter a token. */
  authRequired?: boolean;
}
