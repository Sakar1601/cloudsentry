"use client";

import { useEffect, useRef, useState } from "react";

import type {
  AgentMoveState,
  FindingState,
  GraphEdge,
  GraphNode,
  GraphSocketState,
  PendingAction,
} from "./types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

function edgeKey(edge: GraphEdge): string {
  return `${edge.source}|${edge.target}|${edge.relation}`;
}

async function fetchActions(): Promise<Record<string, PendingAction>> {
  const response = await fetch(`${API_BASE_URL}/actions`);
  const actions: PendingAction[] = await response.json();
  const byId: Record<string, PendingAction> = {};
  for (const action of actions) {
    byId[action.id] = action;
  }
  return byId;
}

export function useGraphSocket(): GraphSocketState {
  const [nodes, setNodes] = useState<Record<string, GraphNode>>({});
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [agents, setAgents] = useState<Record<string, AgentMoveState>>({});
  const [findings, setFindings] = useState<Record<string, FindingState>>({});
  const [actions, setActions] = useState<Record<string, PendingAction>>({});
  const [loading, setLoading] = useState(true);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let cancelled = false;

    function handleMessage(message: any) {
      switch (message.type) {
        case "node_added":
        case "node_updated":
          setNodes((prev) => ({ ...prev, [message.node.node_id]: message.node }));
          break;
        case "node_removed":
          setNodes((prev) => {
            const next = { ...prev };
            delete next[message.node_id];
            return next;
          });
          break;
        case "edge_added":
          setEdges((prev) => [...prev, message.edge]);
          break;
        case "edge_removed":
          setEdges((prev) => prev.filter((edge) => edgeKey(edge) !== edgeKey(message.edge)));
          break;
        case "agent_move":
          setAgents((prev) => ({
            ...prev,
            [message.agent_id]: { targetNodeId: message.target_node_id },
          }));
          break;
        case "finding":
          setFindings((prev) => ({
            ...prev,
            [message.agent_id]: { nodeId: message.node_id, text: message.text },
          }));
          break;
        case "action_proposed":
        case "action_resolved":
          fetchActions().then((byId) => {
            if (!cancelled) setActions(byId);
          });
          break;
        default:
          break;
      }
    }

    async function init() {
      const response = await fetch(`${API_BASE_URL}/graph`);
      const graph: { nodes: Record<string, GraphNode>; edges: GraphEdge[] } = await response.json();
      if (cancelled) return;

      setNodes(graph.nodes);
      setEdges(graph.edges);
      setLoading(false);

      const wsUrl = `${API_BASE_URL.replace(/^http/, "ws")}/graph/stream`;
      const socket = new WebSocket(wsUrl);
      socketRef.current = socket;
      socket.addEventListener("message", (event: MessageEvent) => {
        handleMessage(JSON.parse(event.data));
      });
    }

    init();

    return () => {
      cancelled = true;
      socketRef.current?.close();
    };
  }, []);

  return { nodes, edges, agents, findings, actions, loading };
}
