// Single seam between the UI and "the backend". By default it talks to the
// FastAPI service over REST + WebSocket. With NEXT_PUBLIC_STATIC_DEMO=1 it
// talks to an in-browser simulator instead, so the app can be exported as a
// fully static site with no server (see lib/demo/engine.ts).

import { getDemoEngine } from "./demo/engine";
import type { GraphEdge, GraphNode, PendingAction } from "./types";

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";
export const STATIC_DEMO = process.env.NEXT_PUBLIC_STATIC_DEMO === "1";

export interface GraphSnapshot {
  nodes: Record<string, GraphNode>;
  edges: GraphEdge[];
}

export async function getGraph(): Promise<GraphSnapshot> {
  if (STATIC_DEMO) return getDemoEngine().getGraph();
  const response = await fetch(`${API_BASE_URL}/graph`);
  return response.json();
}

export async function getActions(): Promise<PendingAction[]> {
  if (STATIC_DEMO) return getDemoEngine().getActions();
  const response = await fetch(`${API_BASE_URL}/actions`);
  return response.json();
}

export async function resolveAction(id: string, decision: "approve" | "reject"): Promise<void> {
  if (STATIC_DEMO) {
    getDemoEngine().resolve(id, decision);
    return;
  }
  await fetch(`${API_BASE_URL}/actions/${id}/${decision}`, { method: "POST" });
}

/** Subscribe to live events. Returns an unsubscribe function. */
export function connectStream(onMessage: (message: any) => void): () => void {
  if (STATIC_DEMO) return getDemoEngine().subscribe(onMessage);
  const socket = new WebSocket(`${API_BASE_URL.replace(/^http/, "ws")}/graph/stream`);
  socket.addEventListener("message", (event: MessageEvent) => onMessage(JSON.parse(event.data)));
  return () => socket.close();
}
