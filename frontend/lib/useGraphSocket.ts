"use client";

import { useEffect, useRef, useState } from "react";

import { connectStream, getActions, getGraph } from "./api";
import { AuthRequiredError } from "./auth";

import type {
  AgentMoveState,
  FindingState,
  GraphEdge,
  GraphNode,
  GraphSocketState,
  ActivityItem,
  ConnectionStatus,
  LastEvent,
  PendingAction,
} from "./types";

const MAX_ACTIVITY = 60;

function edgeKey(edge: GraphEdge): string {
  return `${edge.source}|${edge.target}|${edge.relation}`;
}

async function fetchActions(): Promise<Record<string, PendingAction>> {
  const actions = await getActions();
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
  const [lastEvent, setLastEvent] = useState<LastEvent | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [connection, setConnection] = useState<ConnectionStatus>("connecting");
  const [authRequired, setAuthRequired] = useState(false);
  const seq = useRef(0);
  const disconnectRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let cancelled = false;

    function handleMessage(message: any) {
      if (
        message.type === "agent_move" ||
        message.type === "finding" ||
        message.type === "action_proposed" ||
        message.type === "action_resolved"
      ) {
        setLastEvent({
          type: message.type,
          agentId: message.agent_id,
          nodeId: message.node_id ?? message.target_node_id,
          at: Date.now(),
        });
      }
      const kind =
        message.type === "finding"
          ? "finding"
          : message.type === "action_proposed"
            ? "proposed"
            : message.type === "action_resolved"
              ? "resolved"
              : null;
      if (kind) {
        const item: ActivityItem = {
          id: `${Date.now()}-${seq.current++}`,
          kind,
          agentId: message.agent_id,
          nodeId: message.node_id,
          actionId: message.action_id,
          text: message.text,
          status: message.status,
          at: Date.now(),
        };
        setActivity((prev) => [item, ...prev].slice(0, MAX_ACTIVITY));
      }
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
      let graph;
      try {
        graph = await getGraph();
      } catch (error) {
        if (!cancelled && error instanceof AuthRequiredError) {
          setAuthRequired(true);
          setLoading(false);
        }
        return;
      }
      if (cancelled) return;

      setNodes(graph.nodes);
      setEdges(graph.edges);
      setLoading(false);
      fetchActions().then((byId) => {
        if (!cancelled) setActions(byId);
      });

      disconnectRef.current = connectStream(handleMessage, (status) => {
        if (!cancelled) setConnection(status);
      });
    }

    init();

    return () => {
      cancelled = true;
      disconnectRef.current?.();
    };
  }, []);

  return { nodes, edges, agents, findings, actions, loading, lastEvent, activity, connection, authRequired };
}
