import type { GraphNode } from "@/lib/types";

import styles from "./NodePanel.module.css";

const TYPE_LABELS: Record<string, string> = {
  ec2: "EC2 instance",
  lambda: "Lambda function",
  dynamodb: "DynamoDB table",
};

export interface NodePanelProps {
  node: GraphNode;
  onClose: () => void;
}

export default function NodePanel({ node, onClose }: NodePanelProps) {
  const metricLabel =
    node.resource_type === "ec2"
      ? "CPU utilisation"
      : node.resource_type === "lambda"
        ? "Avg duration (ms)"
        : "Read capacity units";

  return (
    <aside className={styles.panel} aria-label={`Details for ${node.name}`}>
      <button type="button" className={styles.close} onClick={onClose} aria-label="Close details">
        ×
      </button>
      <h3 className={styles.name}>{node.name}</h3>
      <p className={styles.type}>{TYPE_LABELS[node.resource_type] ?? node.resource_type}</p>
      <dl className={styles.list}>
        <dt>State</dt>
        <dd>{node.state}</dd>
        <dt>7-day cost</dt>
        <dd>{node.cost_7d === null ? "—" : `$${node.cost_7d.toFixed(2)}`}</dd>
        <dt>{metricLabel}</dt>
        <dd>{node.last_metric_snapshot ? node.last_metric_snapshot.value.toFixed(1) : "—"}</dd>
        <dt>Node id</dt>
        <dd className={styles.code}>{node.node_id}</dd>
      </dl>
    </aside>
  );
}
