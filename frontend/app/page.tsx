"use client";

import { useState } from "react";

import AgentIcon from "@/components/AgentIcon";
import ActionCard from "@/components/ActionCard";
import FindingBubble from "@/components/FindingBubble";
import GraphCanvas, { type NodePosition } from "@/components/GraphCanvas";
import Header from "@/components/Header";
import { useGraphSocket } from "@/lib/useGraphSocket";

import styles from "./page.module.css";

export default function Home() {
  const { nodes, edges, agents, findings, actions, loading } = useGraphSocket();
  const [positions, setPositions] = useState<Record<string, NodePosition>>({});

  const nodeCount = Object.keys(nodes).length;

  return (
    <main className={styles.main}>
      <Header active="graph" />

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
