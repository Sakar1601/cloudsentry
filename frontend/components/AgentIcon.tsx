import styles from "./AgentIcon.module.css";

const AGENT_LABELS: Record<string, string> = {
  cost: "Cost",
  performance: "Performance",
  security: "Security",
};

const AGENT_COLORS: Record<string, string> = {
  cost: "#f59e0b",
  performance: "#8b5cf6",
  security: "#ef4444",
};

export interface AgentIconProps {
  agentId: string;
  x: number;
  y: number;
}

export default function AgentIcon({ agentId, x, y }: AgentIconProps) {
  const label = AGENT_LABELS[agentId] ?? agentId;
  const color = AGENT_COLORS[agentId] ?? "#64748b";

  return (
    <div
      className={styles.icon}
      style={{ left: x, top: y, backgroundColor: color }}
      data-testid={`agent-icon-${agentId}`}
    >
      {label}
    </div>
  );
}
