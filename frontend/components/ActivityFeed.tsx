import type { ActivityItem, GraphNode, PendingAction } from "@/lib/types";
import { timeAgo } from "@/lib/useNow";

import styles from "./ActivityFeed.module.css";

const AGENT_LABELS: Record<string, string> = { cost: "Cost", performance: "Performance", security: "Security" };
const AGENT_COLORS: Record<string, string> = {
  cost: "var(--agent-cost)",
  performance: "var(--agent-performance)",
  security: "var(--agent-security)",
};

export interface ActivityFeedProps {
  items: ActivityItem[];
  nodes: Record<string, GraphNode>;
  actions: Record<string, PendingAction>;
  now: number;
}

export default function ActivityFeed({ items, nodes, actions, now }: ActivityFeedProps) {
  if (items.length === 0) {
    return (
      <p className={styles.empty}>
        The agents are scanning the account. Findings and proposals will appear here as they investigate.
      </p>
    );
  }

  return (
    <ol className={styles.feed}>
      {items.map((item) => {
        const action = item.actionId ? actions[item.actionId] : undefined;
        const nodeId = item.nodeId ?? action?.node_id;
        const nodeName = nodeId ? (nodes[nodeId]?.name ?? nodeId.split(":")[1] ?? nodeId) : null;
        const agentId = item.agentId ?? action?.agent_id;

        return (
          <li key={item.id} className={styles.item}>
            <div className={styles.meta}>
              {agentId && (
                <span className={styles.agent}>
                  <span className={styles.dot} style={{ background: AGENT_COLORS[agentId] ?? "var(--node-default)" }} />
                  {AGENT_LABELS[agentId] ?? agentId}
                </span>
              )}
              {nodeName && <span className={styles.node}>{nodeName}</span>}
              <span className={styles.time}>{timeAgo(item.at, now)}</span>
            </div>

            {item.kind === "finding" && <p className={styles.text}>{item.text}</p>}

            {item.kind === "proposed" && (
              <p className={styles.event}>
                Proposed <code>{action?.tool_name ?? "an action"}</code> for approval
              </p>
            )}

            {item.kind === "resolved" && (
              <p className={styles.event}>
                <span className={item.status === "approved" ? styles.approved : styles.rejected}>
                  {item.status === "approved" ? "Approved" : "Rejected"}
                </span>{" "}
                <code>{action?.tool_name ?? "action"}</code>
              </p>
            )}
          </li>
        );
      })}
    </ol>
  );
}
