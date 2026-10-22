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

// Calm, desaturated hues for the structural node layer — deliberately
// distinct from the vivid agent marker colors (AgentIcon.module.css) so
// a node is never mistaken for an agent badge sitting on top of it.
const RESOURCE_COLORS: Record<string, string> = {
  ec2: "#4f8fd1",
  lambda: "#5fb894",
  dynamodb: "#c98f5f",
};

const CANVAS_BACKGROUND = "#0a0d12";
const LINK_COLOR = "rgba(139, 147, 163, 0.35)";

function nodeColor(node: GraphNode): string {
  return RESOURCE_COLORS[node.resource_type] ?? "#6b7280";
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
  onNodeClick?: (nodeId: string | null) => void;
}

export default function GraphCanvas({ nodes, edges, onNodePositions, onNodeClick }: GraphCanvasProps) {
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
  const graphData = useMemo(() => {
    const live = new Set<string>();
    const graphNodes = Object.values(nodes).map((node) => {
      live.add(node.node_id);
      const obj = nodeObjects.current[node.node_id] ?? { id: node.node_id };
      Object.assign(obj, {
        resourceType: node.resource_type,
        name: node.name,
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
    fg.d3Force("charge")?.strength(-120);
    fg.d3Force("link")?.distance(55);
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
          backgroundColor={CANVAS_BACKGROUND}
          nodeColor={(node: any) => node.color}
          nodeVal={(node: any) => node.val}
          nodeLabel={(node: any) => node.name}
          nodeRelSize={4}
          maxZoom={3}
          nodeCanvasObjectMode={() => "after"}
          nodeCanvasObject={(node: any, ctx: CanvasRenderingContext2D, scale: number) => {
            ctx.font = `${11 / scale}px Inter, sans-serif`;
            ctx.textAlign = "center";
            ctx.fillStyle = "rgba(201, 207, 219, 0.85)";
            ctx.fillText(node.name, node.x, node.y + 4 * Math.sqrt(node.val) + 12 / scale);
          }}
          autoPauseRedraw={false}
          onNodeClick={(node: any) => onNodeClick?.(node.id)}
          onBackgroundClick={() => onNodeClick?.(null)}
          cooldownTicks={120}
          onEngineTick={configureForces}
          onEngineStop={() => fgRef.current?.zoomToFit(400, size && size.width < 640 ? 50 : 100)}
          linkColor={() => LINK_COLOR}
          linkWidth={1.5}
          linkLabel={(link: any) => link.relation}
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
