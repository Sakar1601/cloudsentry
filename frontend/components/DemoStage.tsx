"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import ActionCard from "@/components/ActionCard";
import AgentIcon from "@/components/AgentIcon";
import FindingBubble from "@/components/FindingBubble";
import FlowRail from "@/components/FlowRail";
import GraphCanvas, { type NodePosition } from "@/components/GraphCanvas";
import NodePanel from "@/components/NodePanel";
import { STATIC_DEMO, triggerIncident } from "@/lib/api";
import { useGraphSocket } from "@/lib/useGraphSocket";
import type { StepId } from "@/lib/walkthrough";

import styles from "./DemoStage.module.css";

const EVENT_STEP_MS = 3500;

export interface DemoStageProps {
  /** hero: embedded with the walkthrough rail. app: full-bleed working view. */
  variant?: "hero" | "app";
}

export default function DemoStage({ variant = "app" }: DemoStageProps) {
  const { nodes, edges, agents, findings, actions, loading, lastEvent } = useGraphSocket();
  const [positions, setPositions] = useState<Record<string, NodePosition>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [latestFindingAgent, setLatestFindingAgent] = useState<string | null>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const [area, setArea] = useState({ width: 0, height: 0 });

  // Overlays are positioned from node coordinates, so keep them inside the
  // canvas, and dock approval cards below the graph when the canvas is narrow.
  useEffect(() => {
    const element = areaRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setArea({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const narrow = area.width > 0 && area.width < 640;
  const clampX = (x: number, half: number) =>
    area.width ? Math.min(Math.max(x, half + 8), area.width - half - 8) : x;

  // Re-evaluate the "what is happening right now" step when a recent event ages out.
  useEffect(() => {
    if (!lastEvent) return;
    if (lastEvent.type === "finding" && lastEvent.agentId) setLatestFindingAgent(lastEvent.agentId);
    setNow(Date.now());
    const timer = setTimeout(() => setNow(Date.now()), EVENT_STEP_MS + 50);
    return () => clearTimeout(timer);
  }, [lastEvent]);

  const pendingActions = Object.values(actions).filter((a) => a.status === "pending");
  const pendingCount = pendingActions.length;

  const activeStep: StepId = useMemo(() => {
    const age = lastEvent ? now - lastEvent.at : Infinity;
    if (lastEvent && age < EVENT_STEP_MS) {
      if (lastEvent.type === "agent_move") return "investigate";
      if (lastEvent.type === "finding") return "conclude";
      if (lastEvent.type === "action_proposed") return "propose";
      if (lastEvent.type === "action_resolved") return "approve";
    }
    return pendingCount > 0 ? "approve" : "observe";
  }, [lastEvent, now, pendingCount]);

  const nodeCount = Object.keys(nodes).length;
  const selectedNode = selected ? nodes[selected] : null;

  return (
    <div className={`${styles.stage} ${variant === "hero" ? styles.hero : styles.app}`}>
      {variant === "hero" && (
        <FlowRail
          activeStep={activeStep}
          pendingCount={pendingCount}
          canTrigger={STATIC_DEMO}
          onTrigger={triggerIncident}
        />
      )}

      <div className={styles.canvasArea} ref={areaRef}>
        {loading ? (
          <div className={styles.status}>
            <div className={styles.statusInner}>
              <div className={styles.spinner} aria-hidden="true" />
              <span>Loading graph…</span>
            </div>
          </div>
        ) : nodeCount === 0 ? (
          <div className={styles.status}>
            <div className={styles.statusInner}>
              <span className={styles.statusTitle}>No resources found in this account yet.</span>
              <span>Once EC2, Lambda, or DynamoDB resources exist, they'll appear here live.</span>
            </div>
          </div>
        ) : (
          <>
            <GraphCanvas
              nodes={nodes}
              edges={edges}
              onNodePositions={setPositions}
              onNodeClick={setSelected}
            />

            {Object.entries(agents).map(([agentId, agentState]) => {
              const position = positions[agentState.targetNodeId];
              if (!position) return null;
              return <AgentIcon key={agentId} agentId={agentId} x={position.x} y={position.y} />;
            })}

            {Object.entries(findings).map(([agentId, finding]) => {
              const position = positions[finding.nodeId];
              if (!position) return null;
              return (
                <FindingBubble
                  key={agentId}
                  agentId={agentId}
                  text={finding.text}
                  x={clampX(position.x, 112)}
                  y={position.y}
                  dim={latestFindingAgent !== null && latestFindingAgent !== agentId}
                />
              );
            })}

            {pendingActions.length > 0 && (
              <div className={`${styles.tray} ${narrow ? styles.trayNarrow : ""}`} aria-label="Pending approvals">
                {pendingActions.map((action) => (
                  <ActionCard key={action.id} action={action} x={0} y={0} docked />
                ))}
              </div>
            )}

            <Legend />

            {variant === "app" && STATIC_DEMO && (
              <button type="button" className={styles.incident} onClick={triggerIncident}>
                Trigger an incident
              </button>
            )}

            {selectedNode && <NodePanel node={selectedNode} onClose={() => setSelected(null)} />}
          </>
        )}
      </div>
    </div>
  );
}

function Legend() {
  return (
    <dl className={styles.legend} aria-label="Legend">
      <div className={styles.legendRow}>
        <dt>Resources</dt>
        <dd>
          <span className={styles.swatch} style={{ background: "var(--node-ec2)" }} /> EC2
          <span className={styles.swatch} style={{ background: "var(--node-lambda)" }} /> Lambda
          <span className={styles.swatch} style={{ background: "var(--node-dynamodb)" }} /> DynamoDB
        </dd>
      </div>
      <div className={styles.legendRow}>
        <dt>Agents</dt>
        <dd>
          <span className={styles.swatch} style={{ background: "var(--agent-cost)" }} /> Cost
          <span className={styles.swatch} style={{ background: "var(--agent-performance)" }} /> Performance
          <span className={styles.swatch} style={{ background: "var(--agent-security)" }} /> Security
        </dd>
      </div>
      <div className={styles.legendNote}>Node size = 7-day cost. Click a node for details.</div>
    </dl>
  );
}
