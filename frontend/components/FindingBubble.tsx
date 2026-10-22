import styles from "./FindingBubble.module.css";

const AGENT_COLORS: Record<string, string> = {
  cost: "var(--agent-cost)",
  performance: "var(--agent-performance)",
  security: "var(--agent-security)",
};

const AGENT_LABELS: Record<string, string> = {
  cost: "Cost agent",
  performance: "Performance agent",
  security: "Security agent",
};

export interface FindingBubbleProps {
  agentId: string;
  text: string;
  x: number;
  y: number;
  /** An older finding: shown as a single line until hovered. */
  dim?: boolean;
}

export default function FindingBubble({ agentId, text, x, y, dim = false }: FindingBubbleProps) {
  return (
    <div className={`${styles.bubble} ${dim ? styles.dim : ""}`} style={{ left: x, top: y, ['--agent-color' as string]: AGENT_COLORS[agentId] }} data-testid={`finding-bubble-${agentId}`}>
      <span className={styles.agentLabel}>{AGENT_LABELS[agentId] ?? agentId}</span>
      <span className={styles.text} key={text}>
        {dim
          ? text
          : text.split(" ").map((word, i) => (
              <span key={i} className={styles.word} style={{ animationDelay: `${Math.min(i * 32, 1400)}ms` }}>
                {word}{" "}
              </span>
            ))}
      </span>
    </div>
  );
}
