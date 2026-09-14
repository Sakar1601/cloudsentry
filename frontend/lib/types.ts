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

export interface GraphSocketState {
  nodes: Record<string, GraphNode>;
  edges: GraphEdge[];
  agents: Record<string, AgentMoveState>;
  findings: Record<string, FindingState>;
  actions: Record<string, PendingAction>;
  loading: boolean;
}
