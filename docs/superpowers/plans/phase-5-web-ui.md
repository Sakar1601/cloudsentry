# Phase 5 — Web UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Next.js frontend: a live force-directed graph view with animated agent icons, finding bubbles, and action cards wired to the approval endpoints, plus an Audit Log page — consuming the Phase 1–4 backend API as-is, no backend changes.

**Architecture:** A single custom hook (`useGraphSocket`) owns all live state — it seeds from `GET /graph`, then applies `WS /graph/stream` events (`node_added/updated/removed`, `edge_added/removed`, `agent_move`, `finding`, `action_proposed`, `action_resolved`) as reducer-style updates. `GraphCanvas` wraps `react-force-graph-2d` for the canvas rendering and reports each node's live x/y position back up so `AgentIcon`/`FindingBubble`/`ActionCard` can be absolutely positioned on top of the canvas as plain HTML overlays. `ActionCard` posts directly to the approve/reject endpoints and relies on the resulting `action_resolved` WS event (flowing back through `useGraphSocket`) to update its own status — no local optimistic state. A separate `/audit` page does a one-shot `GET /actions` fetch into a plain table.

**Tech Stack:** Next.js 14 (App Router) + TypeScript, `react-force-graph-2d` for the canvas graph, CSS Modules (no UI framework), Vitest + React Testing Library for tests (first frontend test tooling in this project — mocks `fetch` and `WebSocket`, never hits a real backend).

**Spec:** `docs/spec.md` (section 4.7 Web UI, section 7 Phase 5)

## Global Constraints

- No test may make a real network call (`fetch`) or open a real WebSocket — every test mocks both.
- `NEXT_PUBLIC_API_BASE_URL` (default `http://localhost:8000`) is the single source of truth for the backend URL, read the same way everywhere it's needed — this same variable gets pointed at a deployed backend URL in Phase 6.
- Clients fetch the full graph via `GET /graph` once, then rely on `WS /graph/stream` for updates only — never re-poll `GET /graph` (matches the backend's Phase 2 design contract).
- No backend files (`backend/`) are modified by this plan.
- Out of scope: animated edge pulses tied to live traffic changes, and drag/zoom polish beyond what `react-force-graph-2d` provides by default — spec calls these out as demo-quality goals for later polish passes, not a Phase 5 blocker; this phase's bar is a working, correctly-wired live UI.

## Design Notes (Phase 5 scoping decisions)

- **There is no single-action `GET /actions/{id}` backend route.** So `useGraphSocket` responds to both `action_proposed` and `action_resolved` by refetching the full `GET /actions` list and replacing its `actions` map wholesale — simplest correct approach given the available API surface.
- **`findings` holds only the most recent finding per agent**, matching the backend reality that each agent runs one investigation at a time — a new `finding` event for an agent simply replaces its previous entry.
- **`ActionCard` never guesses its own resolved status.** Clicking Approve/Reject only POSTs and disables the buttons; the card's displayed status always comes from the `actions` map, which only changes via the `action_resolved` WS event round-tripping back through `useGraphSocket`.
- **Node positions are lifted, not owned, by overlay components.** `GraphCanvas` is the only thing that talks to `react-force-graph-2d`; it reports positions via an `onNodePositions` callback, and `AgentIcon`/`FindingBubble`/`ActionCard` are given their `x`/`y` directly by the parent page — they know nothing about the graph library.
- **A sparse account (few or zero nodes) is an expected empty state**, not a bug — matches the reality already confirmed live in Phase 1's manual verification.

---

## File Structure

- `frontend/package.json`, `frontend/tsconfig.json`, `frontend/next.config.js`, `frontend/vitest.config.ts`, `frontend/vitest.setup.ts`, `frontend/.env.local.example` — toolchain and config.
- `frontend/app/layout.tsx` — root layout.
- `frontend/app/page.tsx` + `page.module.css` — main graph view.
- `frontend/app/audit/page.tsx` — Audit Log page.
- `frontend/lib/types.ts` — shared TypeScript types (`GraphNode`, `GraphEdge`, `PendingAction`, `GraphSocketState`).
- `frontend/lib/useGraphSocket.ts` — the live-state hook.
- `frontend/components/GraphCanvas.tsx` + `.module.css` — canvas graph wrapper.
- `frontend/components/AgentIcon.tsx` + `.module.css` — agent marker.
- `frontend/components/FindingBubble.tsx` + `.module.css` — finding text bubble.
- `frontend/components/ActionCard.tsx` + `.module.css` — approve/reject card.
- `frontend/components/AuditTable.tsx` + `.module.css` — audit log table.
- Tests colocated next to the file they cover (`*.test.ts`/`*.test.tsx`), matching common Next.js/Vitest convention.

---

## Task 1: Next.js + TypeScript + Vitest scaffold

**Files:**
- Create: `frontend/package.json`, `frontend/tsconfig.json`, `frontend/next.config.js`, `frontend/vitest.config.ts`, `frontend/vitest.setup.ts`
- Create: `frontend/app/layout.tsx`, `frontend/app/page.tsx`
- Test: `frontend/app/page.test.tsx`

**Interfaces:**
- Produces: a working `npm test` (Vitest) and `npm run dev` (Next.js) toolchain; `export default function Home()` in `app/page.tsx` — replaced by the real implementation in Task 7.

- [ ] **Step 1: Write `frontend/package.json`**

```json
{
  "name": "cloudsentry-frontend",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest run"
  },
  "dependencies": {
    "next": "^14.2.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "react-force-graph-2d": "^1.25.0"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.4.0",
    "@testing-library/react": "^16.0.0",
    "@types/node": "^20.14.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "jsdom": "^24.1.0",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2: Write `frontend/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Write `frontend/next.config.js`**

```js
/** @type {import('next').NextConfig} */
const nextConfig = {};

module.exports = nextConfig;
```

- [ ] **Step 4: Write `frontend/vitest.config.ts`**

```ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
  },
  resolve: {
    alias: {
      "@": __dirname,
    },
  },
});
```

- [ ] **Step 5: Write `frontend/vitest.setup.ts`**

```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 6: Write `frontend/.env.local.example`**

```
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
```

- [ ] **Step 7: Write the failing test** in `frontend/app/page.test.tsx`

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Home from "./page";

describe("Home page (scaffold)", () => {
  it("renders a placeholder heading", () => {
    render(<Home />);

    expect(screen.getByText("Cloudsentry")).toBeInTheDocument();
  });
});
```

- [ ] **Step 8: Write `frontend/app/layout.tsx`**

```tsx
export const metadata = {
  title: "Cloudsentry",
  description: "Living infrastructure map",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 9: Write the placeholder `frontend/app/page.tsx`**

```tsx
export default function Home() {
  return <main>Cloudsentry</main>;
}
```

- [ ] **Step 10: Install dependencies and run the test**

Run (from `frontend/`): `npm install && npm test`
Expected: PASS (1 test) — this proves the Node/npm/Next/Vitest toolchain is wired correctly.

- [ ] **Step 11: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/tsconfig.json frontend/next.config.js \
  frontend/vitest.config.ts frontend/vitest.setup.ts frontend/.env.local.example \
  frontend/app/layout.tsx frontend/app/page.tsx frontend/app/page.test.tsx
git commit -m "chore: scaffold Next.js + TypeScript + Vitest frontend"
```

---

## Task 2: `useGraphSocket()` live-state hook

**Files:**
- Create: `frontend/lib/types.ts`
- Create: `frontend/lib/useGraphSocket.ts`
- Test: `frontend/lib/useGraphSocket.test.tsx`

**Interfaces:**
- Consumes: backend `GET /graph`, `WS /graph/stream`, `GET /actions` response shapes (Phases 1–4, unchanged).
- Produces: `useGraphSocket(): GraphSocketState` where `GraphSocketState = { nodes: Record<string, GraphNode>; edges: GraphEdge[]; agents: Record<string, {targetNodeId: string}>; findings: Record<string, {nodeId: string; text: string}>; actions: Record<string, PendingAction>; loading: boolean }`.

- [ ] **Step 1: Write `frontend/lib/types.ts`**

```ts
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
```

- [ ] **Step 2: Write the failing tests** in `frontend/lib/useGraphSocket.test.tsx`

```tsx
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
```

- [ ] **Step 3: Run tests to verify they fail**

Run (from `frontend/`): `npm test`
Expected: FAIL — `frontend/lib/useGraphSocket.ts` doesn't exist yet.

- [ ] **Step 4: Write minimal implementation** in `frontend/lib/useGraphSocket.ts`

```ts
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
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: PASS (6 tests: the scaffold test plus 5 new ones)

- [ ] **Step 6: Commit**

```bash
git add frontend/lib/types.ts frontend/lib/useGraphSocket.ts frontend/lib/useGraphSocket.test.tsx
git commit -m "feat: add useGraphSocket live-state hook"
```

---

## Task 3: `GraphCanvas` component

**Files:**
- Create: `frontend/components/GraphCanvas.tsx`, `frontend/components/GraphCanvas.module.css`
- Test: `frontend/components/GraphCanvas.test.tsx`

**Interfaces:**
- Consumes: `GraphNode`, `GraphEdge` (Task 2).
- Produces: `GraphCanvas({ nodes, edges, onNodePositions? }) -> JSX.Element`; exported `NodePosition = { x: number; y: number }`.

- [ ] **Step 1: Write the failing test** in `frontend/components/GraphCanvas.test.tsx`

```tsx
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-force-graph-2d", () => ({
  default: vi.fn(() => <div data-testid="force-graph-mock" />),
}));

import ForceGraph2D from "react-force-graph-2d";

import type { GraphNode } from "@/lib/types";
import GraphCanvas from "./GraphCanvas";

describe("GraphCanvas", () => {
  it("passes mapped graphData to react-force-graph-2d", () => {
    const nodes: Record<string, GraphNode> = {
      "ec2:i-1": {
        node_id: "ec2:i-1",
        resource_type: "ec2",
        name: "web",
        state: "running",
        tags: {},
        cost_7d: 10,
        last_metric_snapshot: null,
      },
    };
    const edges = [{ source: "ec2:i-1", target: "ec2:i-2", relation: "same_vpc" }];

    render(<GraphCanvas nodes={nodes} edges={edges} />);

    const call = (ForceGraph2D as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.graphData.nodes).toEqual([
      { id: "ec2:i-1", resourceType: "ec2", name: "web", color: "#f59e0b", val: expect.any(Number) },
    ]);
    expect(call.graphData.links).toEqual([
      { source: "ec2:i-1", target: "ec2:i-2", relation: "same_vpc" },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL with `Cannot find module './GraphCanvas'`

- [ ] **Step 3: Write `frontend/components/GraphCanvas.module.css`**

```css
.canvasWrapper {
  position: relative;
  width: 100%;
  height: 100%;
}
```

- [ ] **Step 4: Write minimal implementation** in `frontend/components/GraphCanvas.tsx`

```tsx
"use client";

import ForceGraph2D from "react-force-graph-2d";

import type { GraphEdge, GraphNode } from "@/lib/types";

import styles from "./GraphCanvas.module.css";

const RESOURCE_COLORS: Record<string, string> = {
  ec2: "#f59e0b",
  lambda: "#8b5cf6",
  dynamodb: "#22d3ee",
};

function nodeColor(node: GraphNode): string {
  return RESOURCE_COLORS[node.resource_type] ?? "#94a3b8";
}

function nodeSize(node: GraphNode): number {
  if (node.cost_7d === null || node.cost_7d <= 0) return 6;
  return Math.min(24, 6 + Math.log10(node.cost_7d + 1) * 6);
}

export interface NodePosition {
  x: number;
  y: number;
}

export interface GraphCanvasProps {
  nodes: Record<string, GraphNode>;
  edges: GraphEdge[];
  onNodePositions?: (positions: Record<string, NodePosition>) => void;
}

export default function GraphCanvas({ nodes, edges, onNodePositions }: GraphCanvasProps) {
  const graphData = {
    nodes: Object.values(nodes).map((node) => ({
      id: node.node_id,
      resourceType: node.resource_type,
      name: node.name,
      color: nodeColor(node),
      val: nodeSize(node),
    })),
    links: edges.map((edge) => ({
      source: edge.source,
      target: edge.target,
      relation: edge.relation,
    })),
  };

  return (
    <div className={styles.canvasWrapper}>
      <ForceGraph2D
        graphData={graphData}
        nodeColor={(node: any) => node.color}
        nodeVal={(node: any) => node.val}
        nodeLabel={(node: any) => node.name}
        linkLabel={(link: any) => link.relation}
        onRenderFramePost={() => {
          if (!onNodePositions) return;
          const positions: Record<string, NodePosition> = {};
          for (const node of graphData.nodes as any[]) {
            if (typeof node.x === "number" && typeof node.y === "number") {
              positions[node.id] = { x: node.x, y: node.y };
            }
          }
          onNodePositions(positions);
        }}
      />
    </div>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add frontend/components/GraphCanvas.tsx frontend/components/GraphCanvas.module.css frontend/components/GraphCanvas.test.tsx
git commit -m "feat: add GraphCanvas component wrapping react-force-graph-2d"
```

---

## Task 4: `AgentIcon` and `FindingBubble` components

**Files:**
- Create: `frontend/components/AgentIcon.tsx`, `frontend/components/AgentIcon.module.css`
- Create: `frontend/components/FindingBubble.tsx`, `frontend/components/FindingBubble.module.css`
- Test: `frontend/components/AgentIcon.test.tsx`, `frontend/components/FindingBubble.test.tsx`

**Interfaces:**
- Produces: `AgentIcon({ agentId, x, y }) -> JSX.Element`; `FindingBubble({ agentId, text, x, y }) -> JSX.Element`. (Conditional "only render when a finding exists" is the caller's responsibility — see Task 7.)

- [ ] **Step 1: Write the failing tests**

`frontend/components/AgentIcon.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import AgentIcon from "./AgentIcon";

describe("AgentIcon", () => {
  it("renders a labeled marker at the given position", () => {
    render(<AgentIcon agentId="cost" x={120} y={80} />);

    const icon = screen.getByTestId("agent-icon-cost");
    expect(icon).toHaveTextContent("Cost");
    expect(icon.style.left).toBe("120px");
    expect(icon.style.top).toBe("80px");
  });

  it("falls back to the raw agent id when unknown", () => {
    render(<AgentIcon agentId="mystery" x={0} y={0} />);

    expect(screen.getByTestId("agent-icon-mystery")).toHaveTextContent("mystery");
  });
});
```

`frontend/components/FindingBubble.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import FindingBubble from "./FindingBubble";

describe("FindingBubble", () => {
  it("renders the finding text at the given position", () => {
    render(<FindingBubble agentId="cost" text="Idle instance costing $12/week." x={50} y={40} />);

    const bubble = screen.getByTestId("finding-bubble-cost");
    expect(bubble).toHaveTextContent("Idle instance costing $12/week.");
    expect(bubble.style.left).toBe("50px");
    expect(bubble.style.top).toBe("40px");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — neither component exists yet.

- [ ] **Step 3: Write `frontend/components/AgentIcon.module.css`**

```css
.icon {
  position: absolute;
  transform: translate(-50%, -50%);
  padding: 2px 8px;
  border-radius: 999px;
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
  pointer-events: none;
}
```

- [ ] **Step 4: Write `frontend/components/AgentIcon.tsx`**

```tsx
import styles from "./AgentIcon.module.css";

const AGENT_LABELS: Record<string, string> = {
  cost: "Cost",
  performance: "Performance",
  security: "Security",
};

const AGENT_COLORS: Record<string, string> = {
  cost: "#f59e0b",
  performance: "#8b5cf6",
  security: "#ef4444",
};

export interface AgentIconProps {
  agentId: string;
  x: number;
  y: number;
}

export default function AgentIcon({ agentId, x, y }: AgentIconProps) {
  const label = AGENT_LABELS[agentId] ?? agentId;
  const color = AGENT_COLORS[agentId] ?? "#64748b";

  return (
    <div
      className={styles.icon}
      style={{ left: x, top: y, backgroundColor: color }}
      data-testid={`agent-icon-${agentId}`}
    >
      {label}
    </div>
  );
}
```

- [ ] **Step 5: Write `frontend/components/FindingBubble.module.css`**

```css
.bubble {
  position: absolute;
  transform: translate(-50%, -140%);
  max-width: 220px;
  padding: 6px 10px;
  border-radius: 8px;
  background: #ffffff;
  color: #0f172a;
  font-size: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}
```

- [ ] **Step 6: Write `frontend/components/FindingBubble.tsx`**

```tsx
import styles from "./FindingBubble.module.css";

export interface FindingBubbleProps {
  agentId: string;
  text: string;
  x: number;
  y: number;
}

export default function FindingBubble({ agentId, text, x, y }: FindingBubbleProps) {
  return (
    <div className={styles.bubble} style={{ left: x, top: y }} data-testid={`finding-bubble-${agentId}`}>
      {text}
    </div>
  );
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add frontend/components/AgentIcon.tsx frontend/components/AgentIcon.module.css frontend/components/AgentIcon.test.tsx \
  frontend/components/FindingBubble.tsx frontend/components/FindingBubble.module.css frontend/components/FindingBubble.test.tsx
git commit -m "feat: add AgentIcon and FindingBubble overlay components"
```

---

## Task 5: `ActionCard` component

**Files:**
- Create: `frontend/components/ActionCard.tsx`, `frontend/components/ActionCard.module.css`
- Test: `frontend/components/ActionCard.test.tsx`

**Interfaces:**
- Consumes: `PendingAction` (Task 2).
- Produces: `ActionCard({ action, x, y }) -> JSX.Element`, POSTing to `{API_BASE_URL}/actions/{id}/approve` or `/reject`.

- [ ] **Step 1: Write the failing tests** in `frontend/components/ActionCard.test.tsx`

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PendingAction } from "@/lib/types";

import ActionCard from "./ActionCard";

const pendingAction: PendingAction = {
  id: "action-1",
  agent_id: "cost",
  node_id: "ec2:i-1",
  tool_name: "stop_ec2_instance",
  params: { instance_id: "i-1" },
  proposed_reasoning: "Idle for 14 hours.",
  status: "pending",
  created_at: "2026-09-14T00:00:00",
  resolved_at: null,
  result: null,
};

describe("ActionCard", () => {
  beforeEach(() => {
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({}) } as Response));
  });

  it("posts to the approve endpoint when Approve is clicked", async () => {
    render(<ActionCard action={pendingAction} x={0} y={0} />);

    fireEvent.click(screen.getByText("Approve"));

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith("http://localhost:8000/actions/action-1/approve", {
        method: "POST",
      })
    );
  });

  it("posts to the reject endpoint when Reject is clicked", async () => {
    render(<ActionCard action={pendingAction} x={0} y={0} />);

    fireEvent.click(screen.getByText("Reject"));

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith("http://localhost:8000/actions/action-1/reject", {
        method: "POST",
      })
    );
  });

  it("disables both buttons while a request is in flight", async () => {
    let resolveFetch: (value: Response) => void = () => {};
    global.fetch = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        })
    );

    render(<ActionCard action={pendingAction} x={0} y={0} />);
    fireEvent.click(screen.getByText("Approve"));

    expect(screen.getByText("Approve")).toBeDisabled();
    expect(screen.getByText("Reject")).toBeDisabled();

    resolveFetch({ ok: true, json: async () => ({}) } as Response);
  });

  it("renders a resolved state with no buttons when status is not pending", () => {
    render(<ActionCard action={{ ...pendingAction, status: "approved" }} x={0} y={0} />);

    expect(screen.getByText("approved")).toBeInTheDocument();
    expect(screen.queryByText("Approve")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `ActionCard` doesn't exist yet.

- [ ] **Step 3: Write `frontend/components/ActionCard.module.css`**

```css
.card {
  position: absolute;
  transform: translate(-50%, 12px);
  width: 220px;
  padding: 10px;
  border-radius: 8px;
  background: #0f172a;
  color: #f8fafc;
  font-size: 12px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
}

.toolName {
  font-weight: 700;
  margin-bottom: 4px;
}

.params {
  white-space: pre-wrap;
  font-size: 11px;
  margin: 4px 0;
}

.reasoning {
  font-style: italic;
  margin: 4px 0;
}

.buttons {
  display: flex;
  gap: 8px;
  margin-top: 6px;
}

.resolved {
  margin-top: 6px;
  text-transform: uppercase;
  font-weight: 600;
}
```

- [ ] **Step 4: Write `frontend/components/ActionCard.tsx`**

```tsx
"use client";

import { useState } from "react";

import type { PendingAction } from "@/lib/types";

import styles from "./ActionCard.module.css";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export interface ActionCardProps {
  action: PendingAction;
  x: number;
  y: number;
}

export default function ActionCard({ action, x, y }: ActionCardProps) {
  const [submitting, setSubmitting] = useState(false);

  async function resolve(decision: "approve" | "reject") {
    setSubmitting(true);
    try {
      await fetch(`${API_BASE_URL}/actions/${action.id}/${decision}`, { method: "POST" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.card} style={{ left: x, top: y }} data-testid={`action-card-${action.id}`}>
      <div className={styles.toolName}>{action.tool_name}</div>
      <pre className={styles.params}>{JSON.stringify(action.params, null, 2)}</pre>
      {action.proposed_reasoning && <p className={styles.reasoning}>{action.proposed_reasoning}</p>}
      {action.status === "pending" ? (
        <div className={styles.buttons}>
          <button disabled={submitting} onClick={() => resolve("approve")}>
            Approve
          </button>
          <button disabled={submitting} onClick={() => resolve("reject")}>
            Reject
          </button>
        </div>
      ) : (
        <div className={styles.resolved}>{action.status}</div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add frontend/components/ActionCard.tsx frontend/components/ActionCard.module.css frontend/components/ActionCard.test.tsx
git commit -m "feat: add ActionCard component with approve/reject wiring"
```

---

## Task 6: Audit Log page

**Files:**
- Create: `frontend/components/AuditTable.tsx`, `frontend/components/AuditTable.module.css`
- Create: `frontend/app/audit/page.tsx`
- Test: `frontend/components/AuditTable.test.tsx`, `frontend/app/audit/page.test.tsx`

**Interfaces:**
- Consumes: `PendingAction` (Task 2).
- Produces: `AuditTable({ actions }) -> JSX.Element`; `AuditPage() -> JSX.Element` (fetches `GET {API_BASE_URL}/actions` on mount).

- [ ] **Step 1: Write the failing tests**

`frontend/components/AuditTable.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { PendingAction } from "@/lib/types";

import AuditTable from "./AuditTable";

const action: PendingAction = {
  id: "action-1",
  agent_id: "cost",
  node_id: "ec2:i-1",
  tool_name: "stop_ec2_instance",
  params: {},
  proposed_reasoning: null,
  status: "approved",
  created_at: "2026-09-14T00:00:00",
  resolved_at: "2026-09-14T00:05:00",
  result: null,
};

describe("AuditTable", () => {
  it("renders one row per action", () => {
    render(<AuditTable actions={[action]} />);

    expect(screen.getByText("stop_ec2_instance")).toBeInTheDocument();
    expect(screen.getByText("approved")).toBeInTheDocument();
  });

  it("renders an empty state when there are no actions", () => {
    render(<AuditTable actions={[]} />);

    expect(screen.getByText("No actions have been proposed yet.")).toBeInTheDocument();
  });
});
```

`frontend/app/audit/page.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import AuditPage from "./page";

describe("AuditPage", () => {
  beforeEach(() => {
    global.fetch = vi.fn(async () => ({
      json: async () => [
        {
          id: "action-1",
          agent_id: "cost",
          node_id: "ec2:i-1",
          tool_name: "stop_ec2_instance",
          params: {},
          proposed_reasoning: null,
          status: "approved",
          created_at: "2026-09-14T00:00:00",
          resolved_at: "2026-09-14T00:05:00",
          result: null,
        },
      ],
    })) as unknown as typeof fetch;
  });

  it("fetches and renders actions from GET /actions", async () => {
    render(<AuditPage />);

    await waitFor(() => expect(screen.getByText("stop_ec2_instance")).toBeInTheDocument());
    expect(global.fetch).toHaveBeenCalledWith("http://localhost:8000/actions");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — neither `AuditTable` nor the audit page exists yet.

- [ ] **Step 3: Write `frontend/components/AuditTable.module.css`**

```css
.table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.table th,
.table td {
  text-align: left;
  padding: 6px 10px;
  border-bottom: 1px solid #e2e8f0;
}

.empty {
  color: #64748b;
  font-size: 13px;
}
```

- [ ] **Step 4: Write `frontend/components/AuditTable.tsx`**

```tsx
import type { PendingAction } from "@/lib/types";

import styles from "./AuditTable.module.css";

export interface AuditTableProps {
  actions: PendingAction[];
}

export default function AuditTable({ actions }: AuditTableProps) {
  if (actions.length === 0) {
    return <p className={styles.empty}>No actions have been proposed yet.</p>;
  }

  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th>Created</th>
          <th>Agent</th>
          <th>Node</th>
          <th>Tool</th>
          <th>Status</th>
          <th>Resolved</th>
        </tr>
      </thead>
      <tbody>
        {actions.map((action) => (
          <tr key={action.id}>
            <td>{action.created_at}</td>
            <td>{action.agent_id}</td>
            <td>{action.node_id}</td>
            <td>{action.tool_name}</td>
            <td>{action.status}</td>
            <td>{action.resolved_at ?? "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 5: Write `frontend/app/audit/page.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";

import AuditTable from "@/components/AuditTable";
import type { PendingAction } from "@/lib/types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export default function AuditPage() {
  const [actions, setActions] = useState<PendingAction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE_URL}/actions`)
      .then((response) => response.json())
      .then((data: PendingAction[]) => {
        if (!cancelled) {
          setActions(data);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main>
      <h1>Audit Log</h1>
      {loading ? <p>Loading…</p> : <AuditTable actions={actions} />}
    </main>
  );
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add frontend/components/AuditTable.tsx frontend/components/AuditTable.module.css frontend/components/AuditTable.test.tsx \
  frontend/app/audit/page.tsx frontend/app/audit/page.test.tsx
git commit -m "feat: add Audit Log page"
```

---

## Task 7: Wire everything into the main graph view

**Files:**
- Modify: `frontend/app/page.tsx`
- Create: `frontend/app/page.module.css`
- Modify: `frontend/app/page.test.tsx`

**Interfaces:**
- Consumes: `useGraphSocket` (Task 2), `GraphCanvas`/`NodePosition` (Task 3), `AgentIcon` (Task 4), `FindingBubble` (Task 4), `ActionCard` (Task 5).

- [ ] **Step 1: Replace the contents of `frontend/app/page.test.tsx`**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/useGraphSocket", () => ({
  useGraphSocket: vi.fn(),
}));

vi.mock("@/components/GraphCanvas", () => ({
  default: vi.fn(({ onNodePositions }: any) => {
    onNodePositions?.({ "ec2:i-1": { x: 100, y: 50 } });
    return <div data-testid="graph-canvas-mock" />;
  }),
}));

import { useGraphSocket } from "@/lib/useGraphSocket";

import Home from "./page";

describe("Home page", () => {
  it("renders a loading state while the initial fetch is in flight", () => {
    (useGraphSocket as ReturnType<typeof vi.fn>).mockReturnValue({
      nodes: {},
      edges: [],
      agents: {},
      findings: {},
      actions: {},
      loading: true,
    });

    render(<Home />);

    expect(screen.getByText("Loading graph…")).toBeInTheDocument();
  });

  it("renders an empty state when there are no nodes", () => {
    (useGraphSocket as ReturnType<typeof vi.fn>).mockReturnValue({
      nodes: {},
      edges: [],
      agents: {},
      findings: {},
      actions: {},
      loading: false,
    });

    render(<Home />);

    expect(screen.getByText("No resources found in this account yet.")).toBeInTheDocument();
  });

  it("renders the graph, an agent icon, its finding, and a pending action card", () => {
    (useGraphSocket as ReturnType<typeof vi.fn>).mockReturnValue({
      nodes: {
        "ec2:i-1": {
          node_id: "ec2:i-1",
          resource_type: "ec2",
          name: "web",
          state: "running",
          tags: {},
          cost_7d: 10,
          last_metric_snapshot: null,
        },
      },
      edges: [],
      agents: { cost: { targetNodeId: "ec2:i-1" } },
      findings: { cost: { nodeId: "ec2:i-1", text: "Idle instance." } },
      actions: {
        "action-1": {
          id: "action-1",
          agent_id: "cost",
          node_id: "ec2:i-1",
          tool_name: "stop_ec2_instance",
          params: {},
          proposed_reasoning: null,
          status: "pending",
          created_at: "2026-09-14T00:00:00",
          resolved_at: null,
          result: null,
        },
      },
      loading: false,
    });

    render(<Home />);

    expect(screen.getByTestId("graph-canvas-mock")).toBeInTheDocument();
    expect(screen.getByTestId("agent-icon-cost")).toBeInTheDocument();
    expect(screen.getByTestId("finding-bubble-cost")).toBeInTheDocument();
    expect(screen.getByTestId("action-card-action-1")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — the placeholder `Home` component doesn't use `useGraphSocket` or render any of the mocked components/test ids.

- [ ] **Step 3: Write `frontend/app/page.module.css`**

```css
.main {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid #e2e8f0;
}

.title {
  font-weight: 700;
}

.status {
  padding: 24px;
  color: #64748b;
}

.canvasArea {
  position: relative;
  flex: 1;
}
```

- [ ] **Step 4: Replace the contents of `frontend/app/page.tsx`**

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";

import AgentIcon from "@/components/AgentIcon";
import ActionCard from "@/components/ActionCard";
import FindingBubble from "@/components/FindingBubble";
import GraphCanvas, { type NodePosition } from "@/components/GraphCanvas";
import { useGraphSocket } from "@/lib/useGraphSocket";

import styles from "./page.module.css";

export default function Home() {
  const { nodes, edges, agents, findings, actions, loading } = useGraphSocket();
  const [positions, setPositions] = useState<Record<string, NodePosition>>({});

  const nodeCount = Object.keys(nodes).length;

  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <span className={styles.title}>Cloudsentry</span>
        <Link href="/audit">Audit Log</Link>
      </header>

      {loading ? (
        <p className={styles.status}>Loading graph…</p>
      ) : nodeCount === 0 ? (
        <p className={styles.status}>No resources found in this account yet.</p>
      ) : (
        <div className={styles.canvasArea}>
          <GraphCanvas nodes={nodes} edges={edges} onNodePositions={setPositions} />

          {Object.entries(agents).map(([agentId, agentState]) => {
            const position = positions[agentState.targetNodeId];
            if (!position) return null;
            return <AgentIcon key={agentId} agentId={agentId} x={position.x} y={position.y} />;
          })}

          {Object.entries(findings).map(([agentId, finding]) => {
            const position = positions[finding.nodeId];
            if (!position) return null;
            return (
              <FindingBubble key={agentId} agentId={agentId} text={finding.text} x={position.x} y={position.y} />
            );
          })}

          {Object.values(actions)
            .filter((action) => action.status === "pending")
            .map((action) => {
              const position = positions[action.node_id];
              if (!position) return null;
              return <ActionCard key={action.id} action={action} x={position.x} y={position.y} />;
            })}
        </div>
      )}
    </main>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test`
Expected: PASS (all tests across the whole suite)

- [ ] **Step 6: Commit**

```bash
git add frontend/app/page.tsx frontend/app/page.module.css frontend/app/page.test.tsx
git commit -m "feat: wire live graph, agents, findings, and action cards into the main view"
```

---

## Task 8: Full-suite verification + manual live verification (with the user present)

**Files:** none created; this task verifies the assembled system.

- [ ] **Step 1: Run the full frontend test suite**

Run (from `frontend/`): `npm test`
Expected: All tests across every module in this plan PASS, fully mocked — no real network calls made.

- [ ] **Step 2: Manual live verification — requires the user to be present**

This is a live, credentials-gated check, framed the same way as prior phases' manual steps — something to run and report on later, not to fabricate a result for now:

1. In one terminal, start the real backend with AWS + Anthropic credentials (from Phases 1–4): `ANTHROPIC_API_KEY=<key> AWS_PROFILE=ops-agent AWS_DEFAULT_REGION=us-east-1 uvicorn app.main:app --port 8000` (from `backend/`).
2. In another terminal, `cp frontend/.env.local.example frontend/.env.local` (defaults already point at `http://localhost:8000`), then `npm run dev` (from `frontend/`).
3. Open the printed local URL in a browser. Confirm: the graph renders real account nodes, agent icons appear and move to nodes as `agent_move` events arrive, finding bubbles show real investigation text, and any proposed action renders as a card.
4. With the user reviewing the specific proposed action, click Approve or Reject and confirm the card updates to a resolved state once the `action_resolved` event round-trips back.
5. Visit `/audit` and confirm the resolved action appears in the table.
6. Stop both processes.

- [ ] **Step 3: Commit** (only if Step 1 required any fixes)

```bash
git add -A
git commit -m "test: verify Phase 5 web UI end-to-end"
```

---

## Self-Review Notes

- **Spec coverage:** The live force-directed canvas graph with resource-type/cost-driven color and size is covered by Task 3 (spec §4.7 "canvas-rendered", "sized/colored by resource type and cost"). Animated agent icons and finding bubbles anchored to node positions are covered by Task 4 and wired in Task 7 (spec §4.7 "agent icons... animate moving to a target node... with a finding bubble"). Action cards with Approve/Reject wired to the approval endpoints, resolving on `action_resolved`, are covered by Task 5 and Task 7 (spec §4.7). The Audit Log page reading `GET /actions` is covered by Task 6 (spec §4.7 "Audit Log page listing all past actions"). Loading/empty states are covered by Task 7 (spec §4.7 "loading states, error states, empty states").
- **Out of scope confirmed absent:** no animated edge pulses tied to live traffic (Design Notes explicitly defer this polish item), no backend changes, no deployment config (Phase 6).
- **Type consistency:** `useGraphSocket()`'s returned `GraphSocketState` shape (Task 2) matches exactly what `Home` (Task 7) destructures (`nodes, edges, agents, findings, actions, loading`). `GraphCanvas`'s `onNodePositions` callback shape (`Record<string, NodePosition>`, Task 3) matches exactly how `Home` consumes it via `setPositions` (Task 7). `AgentIcon`/`FindingBubble`/`ActionCard`'s `x`/`y` props (Tasks 4–5) are populated from that same `positions` map in Task 7, keyed by `agentState.targetNodeId` / `finding.nodeId` / `action.node_id` respectively — all three are `node_id` strings from the same `GraphNode`/`PendingAction` types defined once in Task 2's `types.ts`.
</content>
