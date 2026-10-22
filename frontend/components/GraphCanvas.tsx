"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";

import type { GraphEdge, GraphNode } from "@/lib/types";

import styles from "./GraphCanvas.module.css";

// react-force-graph-2d touches browser-only APIs (window, canvas) at
// module load time. Next.js server-renders "use client" components on
// first load too, so a static import crashes with "window is not
// defined" during SSR — loading it dynamically with ssr:false defers
// that import to the browser only.
const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), { ssr: false });

// Luminous hues for the structural layer. Agent colors (cost amber, performance
// violet, security red) stay reserved for the moving layer on top.
const RESOURCE_COLORS: Record<string, string> = {
  ec2: "#5aa8ff",
  lambda: "#46d9a0",
  dynamodb: "#e2a66b",
};

const AGENT_RGB: Record<string, string> = {
  cost: "245, 166, 35",
  performance: "167, 139, 250",
  security: "242, 84, 91",
};

const LINK_STYLE: Record<string, { color: string; dash: number[] | null; particles: number }> = {
  same_vpc: { color: "rgba(255, 255, 255, 0.10)", dash: [3, 5], particles: 0 },
  references: { color: "rgba(90, 168, 255, 0.38)", dash: null, particles: 2 },
  iam_access: { color: "rgba(167, 139, 250, 0.38)", dash: null, particles: 2 },
};
const DEFAULT_LINK = { color: "rgba(255, 255, 255, 0.12)", dash: null, particles: 0 };

const STOPPED_STATES = new Set(["stopped", "stopping", "terminated", "shutting-down"]);

function nodeColor(node: GraphNode): string {
  if (STOPPED_STATES.has(node.state)) return "#3a414e";
  return RESOURCE_COLORS[node.resource_type] ?? "#6b7280";
}

function nodeSize(node: GraphNode): number {
  if (node.cost_7d === null || node.cost_7d <= 0) return 6;
  return Math.min(24, 6 + Math.log10(node.cost_7d + 1) * 6);
}

function hexToRgb(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}

// Small drawn glyphs so a node says what it is without reading the label.
function drawGlyph(ctx: CanvasRenderingContext2D, type: string, x: number, y: number, s: number, color: string) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = Math.max(1.1, s * 0.16);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (type === "ec2") {
    const w = s * 1.5;
    const h = s * 1.3;
    ctx.beginPath();
    ctx.roundRect(x - w / 2, y - h / 2, w, h, s * 0.25);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - w / 2 + s * 0.3, y - h * 0.12);
    ctx.lineTo(x + w / 2 - s * 0.3, y - h * 0.12);
    ctx.moveTo(x - w / 2 + s * 0.3, y + h * 0.2);
    ctx.lineTo(x + w / 2 - s * 0.3, y + h * 0.2);
    ctx.stroke();
  } else if (type === "lambda") {
    ctx.beginPath();
    ctx.moveTo(x - s * 0.55, y - s * 0.75);
    ctx.lineTo(x - s * 0.05, y - s * 0.75);
    ctx.lineTo(x + s * 0.55, y + s * 0.75);
    ctx.moveTo(x + s * 0.1, y - s * 0.05);
    ctx.lineTo(x - s * 0.55, y + s * 0.75);
    ctx.stroke();
  } else if (type === "dynamodb") {
    const rx = s * 0.7;
    const ry = s * 0.28;
    for (const dy of [-0.45, 0.05, 0.55]) {
      ctx.beginPath();
      ctx.ellipse(x, y + dy * s, rx, ry, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  } else {
    ctx.beginPath();
    ctx.arc(x, y, s * 0.4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export interface NodePosition {
  x: number;
  y: number;
}

export interface NodeHighlight {
  tone: "success" | "rejected" | "error";
  at: number;
}

const HIGHLIGHT_MS = 3600;
const HIGHLIGHT_COLORS = { success: "62, 207, 142", rejected: "154, 163, 181", error: "242, 84, 91" };

export interface GraphCanvasProps {
  nodes: Record<string, GraphNode>;
  edges: GraphEdge[];
  onNodePositions?: (positions: Record<string, NodePosition>) => void;
  onNodeClick?: (nodeId: string | null) => void;
  /** Pulsing rings drawn around nodes whose approvals were just resolved. */
  highlights?: Record<string, NodeHighlight>;
  /** nodeId -> agent ids currently investigating it (drawn as orbiting orbs). */
  agentTargets?: Record<string, string[]>;
  selectedId?: string | null;
  /** Nodes running far above their own baseline: drawn with a pulsing warning ring. */
  anomalies?: Set<string>;
}

export default function GraphCanvas({ nodes, edges, onNodePositions, onNodeClick, highlights, agentTargets, selectedId, anomalies }: GraphCanvasProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<any>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);

  // react-force-graph-2d doesn't auto-track its container's size, so the
  // canvas needs an explicit width/height kept in sync with the wrapper
  // — otherwise it can render at a size that doesn't match the div our
  // absolutely positioned overlays (AgentIcon/FindingBubble/ActionCard)
  // live in, and every screen-coordinate conversion below drifts.
  useEffect(() => {
    const element = wrapperRef.current;
    if (!element) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // The force simulation stores x/y/vx/vy on the node objects it is given, and
  // this component re-renders on every animation frame (via onNodePositions).
  // Rebuilding fresh objects each render would reset every node to the origin,
  // so node objects are reused by id and graphData is memoized on its inputs.
  const nodeObjects = useRef<Record<string, any>>({});
  // When each node first appeared, so it can materialise (staggered) instead of popping in.
  const bornAt = useRef<Record<string, number>>({});
  const born = useRef(0);
  const graphData = useMemo(() => {
    const live = new Set<string>();
    const graphNodes = Object.values(nodes).map((node) => {
      live.add(node.node_id);
      if (bornAt.current[node.node_id] === undefined) bornAt.current[node.node_id] = Date.now() + 120 + born.current++ * 110;
      const obj = nodeObjects.current[node.node_id] ?? { id: node.node_id };
      Object.assign(obj, {
        resourceType: node.resource_type,
        name: node.name,
        stopped: STOPPED_STATES.has(node.state),
        color: nodeColor(node),
        val: nodeSize(node),
      });
      nodeObjects.current[node.node_id] = obj;
      return obj;
    });
    for (const id of Object.keys(nodeObjects.current)) {
      if (!live.has(id)) delete nodeObjects.current[id];
    }
    return {
      nodes: graphNodes,
      links: edges.map((edge) => ({
        source: edge.source,
        target: edge.target,
        relation: edge.relation,
      })),
    };
  }, [nodes, edges]);

  // Spread nodes out. The graph component loads asynchronously, so its ref is
  // not reliably set in an effect; configure forces on the first engine tick.
  const forcesConfigured = useRef(false);
  const configureForces = () => {
    const fg = fgRef.current;
    if (forcesConfigured.current || typeof fg?.d3Force !== "function") return;
    fg.d3Force("charge")?.strength(-170);
    fg.d3Force("link")?.distance(74);
    // Weak pull toward the origin so unconnected clusters stay in frame.
    const gravity = (alpha: number) => {
      for (const node of graphData.nodes as any[]) {
        node.vx -= (node.x ?? 0) * 0.08 * alpha;
        node.vy -= (node.y ?? 0) * 0.08 * alpha;
      }
    };
    fg.d3Force("gravity", gravity);
    forcesConfigured.current = true;
  };

  return (
    <div ref={wrapperRef} className={styles.canvasWrapper}>
      {size && (
        <ForceGraph2D
          ref={fgRef}
          width={size.width}
          height={size.height}
          graphData={graphData}
          backgroundColor="rgba(0,0,0,0)"
          nodeVal={(node: any) => node.val}
          nodeLabel={(node: any) => node.name}
          nodeRelSize={4}
          maxZoom={3}
          autoPauseRedraw={false}
          linkCurvature={0.14}
          linkColor={(link: any) => (LINK_STYLE[link.relation] ?? DEFAULT_LINK).color}
          linkWidth={1.4}
          linkLineDash={(link: any) => (LINK_STYLE[link.relation] ?? DEFAULT_LINK).dash}
          linkLabel={(link: any) => link.relation}
          linkDirectionalParticles={(link: any) => (LINK_STYLE[link.relation] ?? DEFAULT_LINK).particles}
          linkDirectionalParticleSpeed={0.006}
          linkDirectionalParticleWidth={2.4}
          linkDirectionalParticleColor={(link: any) =>
            link.relation === "iam_access" ? "rgba(190, 170, 255, 0.95)" : "rgba(140, 200, 255, 0.95)"
          }
          nodeCanvasObjectMode={() => "replace"}
          nodePointerAreaPaint={(node: any, paint: string, ctx: CanvasRenderingContext2D) => {
            if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) return;
            ctx.fillStyle = paint;
            ctx.beginPath();
            ctx.arc(node.x, node.y, Math.max(11, 4 * Math.sqrt(node.val)) + 6, 0, 2 * Math.PI);
            ctx.fill();
          }}
          nodeCanvasObject={(node: any, ctx: CanvasRenderingContext2D, scale: number) => {
            // The simulation assigns coordinates on its first tick; skip frames before that.
            if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) return;
            const t = Date.now() / 1000;
            // Materialise: eased overshoot scale-in, staggered by arrival order.
            const life = Math.min(1, Math.max(0, (Date.now() - (bornAt.current[node.id] ?? 0)) / 750));
            if (life <= 0) return;
            const pop = 1 + 2.2 * Math.pow(life - 1, 3) + 1.2 * Math.pow(life - 1, 2);
            const r = Math.min(22, Math.max(11, 4 * Math.sqrt(node.val))) * pop;
            ctx.globalAlpha = Math.min(1, life * 2);
            const rgb = hexToRgb(node.color);
            const stopped = node.stopped;

            // soft halo
            if (!stopped) {
              const halo = ctx.createRadialGradient(node.x, node.y, r * 0.6, node.x, node.y, r * 2.8);
              halo.addColorStop(0, `rgba(${rgb}, 0.30)`);
              halo.addColorStop(1, `rgba(${rgb}, 0)`);
              ctx.fillStyle = halo;
              ctx.beginPath();
              ctx.arc(node.x, node.y, r * 2.8, 0, 2 * Math.PI);
              ctx.fill();
            }

            // approval outcome rings
            const highlight = highlights?.[node.id];
            if (highlight) {
              const age = Date.now() - highlight.at;
              if (age < HIGHLIGHT_MS) {
                const hrgb = HIGHLIGHT_COLORS[highlight.tone];
                for (const offset of [0, 600]) {
                  const p = ((age - offset) % 1200) / 1200;
                  if (age < offset || p < 0) continue;
                  ctx.beginPath();
                  ctx.arc(node.x, node.y, r + 3 + p * 30, 0, 2 * Math.PI);
                  ctx.strokeStyle = `rgba(${hrgb}, ${(1 - p) * 0.9})`;
                  ctx.lineWidth = 2.5 / scale;
                  ctx.stroke();
                }
              }
            }

            // running far above its own baseline: slow warning pulse + badge
            if (!stopped && anomalies?.has(node.id)) {
              const beat = 0.5 + 0.5 * Math.sin(t * 3.2);
              ctx.beginPath();
              ctx.arc(node.x, node.y, r + 6 + beat * 5, 0, 2 * Math.PI);
              ctx.strokeStyle = `rgba(245, 185, 66, ${0.25 + beat * 0.45})`;
              ctx.lineWidth = 2 / scale;
              ctx.stroke();
            }

            // body: ink disc, tinted, ringed in the resource colour
            ctx.beginPath();
            ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
            const body = ctx.createRadialGradient(node.x - r * 0.3, node.y - r * 0.4, r * 0.1, node.x, node.y, r);
            body.addColorStop(0, `rgba(${rgb}, ${stopped ? 0.1 : 0.32})`);
            body.addColorStop(1, "rgba(8, 11, 17, 0.96)");
            ctx.fillStyle = body;
            ctx.fill();
            ctx.lineWidth = (stopped ? 1.4 : 2) / Math.min(scale, 1.6);
            ctx.strokeStyle = `rgba(${rgb}, ${stopped ? 0.5 : 0.95})`;
            ctx.stroke();

            drawGlyph(ctx, node.resourceType, node.x, node.y, r * 0.52, stopped ? "rgba(154,163,181,0.7)" : node.color);

            if (selectedId === node.id) {
              ctx.beginPath();
              ctx.arc(node.x, node.y, r + 5, 0, 2 * Math.PI);
              ctx.strokeStyle = "rgba(255,255,255,0.85)";
              ctx.lineWidth = 1.6 / scale;
              ctx.stroke();
            }

            // agents investigating this node: scanning ring + orbiting orb
            (agentTargets?.[node.id] ?? []).forEach((agentId, i) => {
              const argb = AGENT_RGB[agentId] ?? "255,255,255";
              const phase = (t * 0.85 + i * 0.33) % 1;
              ctx.beginPath();
              ctx.arc(node.x, node.y, r + 4 + phase * 24, 0, 2 * Math.PI);
              ctx.strokeStyle = `rgba(${argb}, ${(1 - phase) * 0.55})`;
              ctx.lineWidth = 1.8 / scale;
              ctx.stroke();

              const ang = t * 1.7 + i * 2.1;
              const ox = node.x + (r + 11) * Math.cos(ang);
              const oy = node.y + (r + 11) * Math.sin(ang);
              const orb = ctx.createRadialGradient(ox, oy, 0, ox, oy, 9);
              orb.addColorStop(0, `rgba(${argb}, 1)`);
              orb.addColorStop(0.35, `rgba(${argb}, 0.55)`);
              orb.addColorStop(1, `rgba(${argb}, 0)`);
              ctx.fillStyle = orb;
              ctx.beginPath();
              ctx.arc(ox, oy, 9, 0, 2 * Math.PI);
              ctx.fill();
              ctx.fillStyle = `rgb(${argb})`;
              ctx.beginPath();
              ctx.arc(ox, oy, 3, 0, 2 * Math.PI);
              ctx.fill();
            });

            if (!stopped && anomalies?.has(node.id)) {
              const bx = node.x + r * 0.78;
              const by = node.y - r * 0.78;
              ctx.beginPath();
              ctx.arc(bx, by, 6.5, 0, 2 * Math.PI);
              ctx.fillStyle = "#f5b942";
              ctx.fill();
              ctx.fillStyle = "#1a1204";
              ctx.font = `800 ${9}px Geist, sans-serif`;
              ctx.textAlign = "center";
              ctx.fillText("!", bx, by + 3.2);
            }

            // label
            ctx.font = `600 ${11.5 / scale}px Geist, Inter, sans-serif`;
            ctx.textAlign = "center";
            ctx.fillStyle = stopped
              ? "rgba(139, 147, 163, 0.65)"
              : selectedId === node.id
                ? "#ffffff"
                : "rgba(214, 221, 235, 0.88)";
            ctx.fillText(stopped ? `${node.name} (stopped)` : node.name, node.x, node.y + r + 15 / scale);
            ctx.globalAlpha = 1;
          }}
          onNodeClick={(node: any) => onNodeClick?.(node.id)}
          onBackgroundClick={() => onNodeClick?.(null)}
          cooldownTicks={120}
          onEngineTick={configureForces}
          onEngineStop={() => fgRef.current?.zoomToFit(400, size && size.width < 640 ? 50 : 100)}
          onRenderFramePost={() => {
            if (!onNodePositions || !fgRef.current) return;
            const positions: Record<string, NodePosition> = {};
            for (const node of graphData.nodes as any[]) {
              if (Number.isFinite(node.x) && Number.isFinite(node.y)) {
                // node.x/node.y are graph-space coordinates, not screen
                // pixels — they must go through the graph's own pan/zoom
                // transform to land where the node actually renders.
                positions[node.id] = fgRef.current.graph2ScreenCoords(node.x, node.y);
              }
            }
            onNodePositions(positions);
          }}
        />
      )}
    </div>
  );
}
