"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import ActionCard from "@/components/ActionCard";
import AgentIcon from "@/components/AgentIcon";
import AppSidebar from "@/components/AppSidebar";
import FindingBubble from "@/components/FindingBubble";
import FlowStepper from "@/components/FlowStepper";
import GraphCanvas, { type NodePosition } from "@/components/GraphCanvas";
import NodePanel from "@/components/NodePanel";
import OutcomeCard from "@/components/OutcomeCard";
import { STATIC_DEMO, triggerIncident } from "@/lib/api";
import { describeOutcome } from "@/lib/outcome";
import { useAnomalies } from "@/lib/useAnomalies";
import { useGraphSocket } from "@/lib/useGraphSocket";
import { useRecentlyResolved } from "@/lib/useRecentlyResolved";
import type { StepId } from "@/lib/walkthrough";

import styles from "./DemoStage.module.css";

const EVENT_STEP_MS = 3500;

export interface DemoStageProps {
  /** hero: a framed product window with the walkthrough stepper (landing page).
   *  app: the working view, with a sidebar for approvals and agent activity. */
  variant?: "hero" | "app";
}

export default function DemoStage({ variant = "app" }: DemoStageProps) {
  const { nodes, edges, agents, findings, actions, loading, lastEvent, activity, connection } = useGraphSocket();
  const [positions, setPositions] = useState<Record<string, NodePosition>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [latestFindingAgent, setLatestFindingAgent] = useState<string | null>(null);
  // Agents that have arrived at a node but have not reported a finding yet.
  const [thinking, setThinking] = useState<Record<string, boolean>>({});
  const areaRef = useRef<HTMLDivElement>(null);
  const [areaWidth, setAreaWidth] = useState(0);

  // Overlays are positioned from node coordinates, so keep them inside the canvas.
  useEffect(() => {
    const element = areaRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setAreaWidth(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const narrow = areaWidth > 0 && areaWidth < 860;
  const clampX = (x: number, half: number) =>
    areaWidth ? Math.min(Math.max(x, half + 8), areaWidth - half - 8) : x;

  // Re-evaluate the "what is happening right now" step when a recent event ages out.
  useEffect(() => {
    if (!lastEvent) return;
    if (lastEvent.type === "finding" && lastEvent.agentId) setLatestFindingAgent(lastEvent.agentId);
    if (lastEvent.agentId && lastEvent.type === "agent_move") setThinking((t) => ({ ...t, [lastEvent.agentId!]: true }));
    if (lastEvent.agentId && lastEvent.type === "finding") setThinking((t) => ({ ...t, [lastEvent.agentId!]: false }));
    setNow(Date.now());
    const timer = setTimeout(() => setNow(Date.now()), EVENT_STEP_MS + 50);
    return () => clearTimeout(timer);
  }, [lastEvent]);

  const { entries: resolvedEntries, dismiss } = useRecentlyResolved(actions);
  const highlights = useMemo(() => {
    const map: Record<string, { tone: "success" | "rejected" | "error"; at: number }> = {};
    for (const entry of resolvedEntries) {
      map[entry.action.node_id] = { tone: describeOutcome(entry.action).tone, at: entry.at };
    }
    return map;
  }, [resolvedEntries]);

  const agentTargets = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const [agentId, state] of Object.entries(agents)) (map[state.targetNodeId] ??= []).push(agentId);
    return map;
  }, [agents]);

  const anomalies = useAnomalies(nodes);

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
  const isHero = variant === "hero";

  const canvas = (
    <div className={styles.canvasArea} ref={areaRef}>
      {loading ? (
        <div className={styles.status}>
          <div className={styles.statusInner}>
            <div className={styles.scan} aria-hidden="true">
              <i />
              <i />
              <i />
            </div>
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
            highlights={highlights}
            agentTargets={agentTargets}
            selectedId={selected}
            anomalies={anomalies}
          />

          {Object.entries(agents).map(([agentId, agentState]) => {
            const position = positions[agentState.targetNodeId];
            if (!position) return null;
            return (
              <AgentIcon
                key={agentId}
                agentId={agentId}
                x={position.x}
                y={position.y}
                thinking={thinking[agentId] === true}
                flip={areaWidth > 0 && position.x + 160 > areaWidth}
              />
            );
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

          {/* Hero: approvals dock inside the canvas. App: they live in the sidebar. */}
          {isHero && (pendingCount > 0 || resolvedEntries.length > 0) && (
            <div className={`${styles.tray} ${narrow ? styles.trayNarrow : ""}`} aria-label="Approvals">
              {resolvedEntries.map((entry) => (
                <OutcomeCard key={`out-${entry.action.id}`} action={entry.action} onDismiss={() => dismiss(entry.action.id)} />
              ))}
              {pendingActions.map((action) => (
                <ActionCard key={action.id} action={action} x={0} y={0} docked />
              ))}
            </div>
          )}

          <Legend />

          {!isHero && STATIC_DEMO && (
            <button type="button" className={styles.incident} onClick={triggerIncident}>
              Trigger an incident
            </button>
          )}

          {selectedNode && <NodePanel node={selectedNode} onClose={() => setSelected(null)} />}
        </>
      )}
    </div>
  );

  if (isHero) {
    return (
      <div className={styles.window}>
        <div className={styles.chrome}>
          <span className={styles.lights} aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span className={styles.url}>Cloudsentry · simulated AWS account</span>
          <span className={styles.livePill}>
            <span className={styles.liveDot} aria-hidden="true" />
            Live simulation
          </span>
        </div>
        <FlowStepper
          activeStep={activeStep}
          pendingCount={pendingCount}
          canTrigger={STATIC_DEMO}
          onTrigger={triggerIncident}
        />
        <div className={styles.heroCanvas}>{canvas}</div>
      </div>
    );
  }

  return (
    <div className={styles.app}>
      <div className={styles.appCanvas}>{canvas}</div>
      <AppSidebar
        nodes={nodes}
        actions={actions}
        activity={activity ?? []}
        connection={connection ?? "live"}
        simulated={STATIC_DEMO}
        resolved={resolvedEntries}
        onDismissResolved={dismiss}
      />
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
