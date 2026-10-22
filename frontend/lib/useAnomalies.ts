"use client";

import { useEffect, useRef, useState } from "react";

import type { GraphNode } from "./types";

const FACTOR = 1.5;
const HISTORY = 6;

/**
 * Node ids whose cost or primary metric is running well above their own
 * recent baseline. This is the same signal the Cost and Performance agents use
 * to pick what to investigate, shown on the graph so you can see what they are
 * reacting to before they get there.
 */
export function useAnomalies(nodes: Record<string, GraphNode>): Set<string> {
  const history = useRef<Record<string, { cost: number[]; metric: number[] }>>({});
  const [anomalies, setAnomalies] = useState<Set<string>>(new Set());

  useEffect(() => {
    const next = new Set<string>();
    for (const node of Object.values(nodes)) {
      if (["stopped", "stopping", "terminated"].includes(node.state)) continue;
      const h = (history.current[node.node_id] ??= { cost: [], metric: [] });
      const cost = node.cost_7d;
      const metric = node.last_metric_snapshot?.value ?? null;

      const above = (values: number[], current: number | null) => {
        if (current === null || values.length < 2) return false;
        const baseline = values.reduce((a, b) => a + b, 0) / values.length;
        return baseline > 0 && current > baseline * FACTOR;
      };
      if (above(h.cost, cost) || above(h.metric, metric)) next.add(node.node_id);

      if (cost !== null) h.cost = [...h.cost, cost].slice(-HISTORY);
      if (metric !== null) h.metric = [...h.metric, metric].slice(-HISTORY);
    }
    setAnomalies((prev) => {
      if (prev.size === next.size && [...next].every((id) => prev.has(id))) return prev;
      return next;
    });
  }, [nodes]);

  return anomalies;
}
