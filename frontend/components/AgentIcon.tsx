import styles from "./AgentIcon.module.css";

const AGENT_LABELS: Record<string, string> = {
  cost: "Cost",
  performance: "Performance",
  security: "Security",
};

const AGENT_COLORS: Record<string, string> = {
  cost: "var(--agent-cost)",
  performance: "var(--agent-performance)",
  security: "var(--agent-security)",
};

export interface AgentIconProps {
  agentId: string;
  x: number;
  y: number;
  /** The agent has arrived and is still working on its finding. */
  thinking?: boolean;
  /** Place the chip to the left of the node (used near the right edge of the canvas). */
  flip?: boolean;
}

export default function AgentIcon({ agentId, x, y, thinking = false, flip = false }: AgentIconProps) {
  const label = AGENT_LABELS[agentId] ?? agentId;
  const color = AGENT_COLORS[agentId] ?? "var(--node-default)";

  return (
    <div
      className={`${styles.icon} ${flip ? styles.flip : ""}`}
      style={{ left: x, top: y, ['--agent-color' as string]: color }}
      data-testid={`agent-icon-${agentId}`}
    >
      <span className={styles.dot} aria-hidden="true" />
      {label}
      {thinking && (
        <span className={styles.thinking} aria-label="investigating">
          <i />
          <i />
          <i />
        </span>
      )}
    </div>
  );
}
