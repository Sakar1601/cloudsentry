import styles from "./FindingBubble.module.css";

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
}

export default function FindingBubble({ agentId, text, x, y }: FindingBubbleProps) {
  return (
    <div className={styles.bubble} style={{ left: x, top: y }} data-testid={`finding-bubble-${agentId}`}>
      <span className={styles.agentLabel}>{AGENT_LABELS[agentId] ?? agentId}</span>
      {text}
    </div>
  );
}
