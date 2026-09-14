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
