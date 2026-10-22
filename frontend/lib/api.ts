// Single seam between the UI and "the backend". By default it talks to the
// FastAPI service over REST + WebSocket. With NEXT_PUBLIC_STATIC_DEMO=1 it
// talks to an in-browser simulator instead, so the app can be exported as a
// fully static site with no server (see lib/demo/engine.ts).

import { AuthRequiredError, clearToken, getToken } from "./auth";
import { getDemoEngine } from "./demo/engine";
import type { GraphEdge, GraphNode, PendingAction } from "./types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";
export const STATIC_DEMO = process.env.NEXT_PUBLIC_STATIC_DEMO === "1";

export interface GraphSnapshot {
  nodes: Record<string, GraphNode>;
  edges: GraphEdge[];
}

/** fetch with the operator token attached (when there is one); a 401 means a token is needed. */
async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = getToken();
  const url = `${API_BASE_URL}${path}`;
  const response = await (token
    ? fetch(url, { ...init, headers: { ...init?.headers, Authorization: `Bearer ${token}` } })
    : init
      ? fetch(url, init)
      : fetch(url));
  if (response.status === 401) {
    clearToken();
    throw new AuthRequiredError();
  }
  return response;
}

export async function getGraph(): Promise<GraphSnapshot> {
  if (STATIC_DEMO) return getDemoEngine().getGraph();
  return (await apiFetch("/graph")).json();
}

export async function getActions(): Promise<PendingAction[]> {
  if (STATIC_DEMO) return getDemoEngine().getActions();
  return (await apiFetch("/actions")).json();
}

export async function resolveAction(id: string, decision: "approve" | "reject"): Promise<void> {
  if (STATIC_DEMO) {
    getDemoEngine().resolve(id, decision);
    return;
  }
  await apiFetch(`/actions/${id}/${decision}`, { method: "POST" });
}

/** Subscribe to live events. Returns an unsubscribe function. */
export function connectStream(
  onMessage: (message: any) => void,
  onStatus?: (status: "connecting" | "live" | "closed") => void,
): () => void {
  if (STATIC_DEMO) {
    onStatus?.("live");
    return getDemoEngine().subscribe(onMessage);
  }
  onStatus?.("connecting");
  const token = getToken();
  const query = token ? `?token=${encodeURIComponent(token)}` : "";
  const socket = new WebSocket(`${API_BASE_URL.replace(/^http/, "ws")}/graph/stream${query}`);
  socket.addEventListener("open", () => onStatus?.("live"));
  socket.addEventListener("close", () => onStatus?.("closed"));
  socket.addEventListener("error", () => onStatus?.("closed"));
  socket.addEventListener("message", (event: MessageEvent) => onMessage(JSON.parse(event.data)));
  return () => socket.close();
}

/** Static demo only: make the simulated account misbehave right now. */
export function triggerIncident(): void {
  if (STATIC_DEMO) getDemoEngine().triggerIncident();
}
