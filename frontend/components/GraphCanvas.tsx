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
