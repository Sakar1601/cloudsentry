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
}

export default function AgentIcon({ agentId, x, y }: AgentIconProps) {
  const label = AGENT_LABELS[agentId] ?? agentId;
  const color = AGENT_COLORS[agentId] ?? "var(--node-default)";

  return (
    <div
      className={styles.icon}
      style={{ left: x, top: y, backgroundColor: color }}
      data-testid={`agent-icon-${agentId}`}
    >
      <span className={styles.dot} aria-hidden="true" />
      {label}
    </div>
  );
}
