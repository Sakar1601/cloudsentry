import styles from "./FindingBubble.module.css";

export interface FindingBubbleProps {
  agentId: string;
  text: string;
  x: number;
  y: number;
}

export default function FindingBubble({ agentId, text, x, y }: FindingBubbleProps) {
  return (
    <div className={styles.bubble} style={{ left: x, top: y }} data-testid={`finding-bubble-${agentId}`}>
      {text}
    </div>
  );
}
