"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";

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
}

export default function GraphCanvas({ nodes, edges, onNodePositions }: GraphCanvasProps) {
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
