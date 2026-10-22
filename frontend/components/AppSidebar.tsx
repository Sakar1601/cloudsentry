"use client";

import ActionCard from "@/components/ActionCard";
import ActivityFeed from "@/components/ActivityFeed";
import type { ActivityItem, ConnectionStatus, GraphNode, PendingAction } from "@/lib/types";
import { useNow } from "@/lib/useNow";

import styles from "./AppSidebar.module.css";

const STATUS_LABELS: Record<ConnectionStatus, string> = {
  connecting: "Connecting…",
  live: "Live",
  closed: "Disconnected, retry by reloading",
};

export interface AppSidebarProps {
  nodes: Record<string, GraphNode>;
  actions: Record<string, PendingAction>;
  activity: ActivityItem[];
  connection: ConnectionStatus;
  simulated?: boolean;
}

export default function AppSidebar({ nodes, actions, activity, connection, simulated }: AppSidebarProps) {
  const now = useNow();
  const nodeList = Object.values(nodes);
  const pending = Object.values(actions).filter((a) => a.status === "pending");
  const totalCost = nodeList.reduce((sum, n) => sum + (n.cost_7d ?? 0), 0);

  return (
    <aside className={styles.sidebar} aria-label="Account overview">
      <div className={styles.status}>
        <span className={`${styles.statusDot} ${styles[connection]}`} aria-hidden="true" />
        <span>{simulated && connection === "live" ? "Live simulation" : STATUS_LABELS[connection]}</span>
      </div>

      <dl className={styles.summary}>
        <div>
          <dt>Resources</dt>
          <dd>{nodeList.length}</dd>
        </div>
        <div>
          <dt>7-day cost</dt>
          <dd>${totalCost.toFixed(0)}</dd>
        </div>
        <div>
          <dt>Need approval</dt>
          <dd className={pending.length > 0 ? styles.attention : undefined}>{pending.length}</dd>
        </div>
      </dl>

      <section className={styles.section} aria-labelledby="approvals-heading">
        <h2 id="approvals-heading" className={styles.heading}>
          Awaiting your approval
        </h2>
        {pending.length === 0 ? (
          <p className={styles.empty}>
            Nothing waiting. When an agent proposes a change, the exact action appears here and nothing runs until
            you approve it.
          </p>
        ) : (
          <div className={styles.cards}>
            {pending.map((action) => (
              <ActionCard key={action.id} action={action} x={0} y={0} docked />
            ))}
          </div>
        )}
      </section>

      <section className={`${styles.section} ${styles.feedSection}`} aria-labelledby="activity-heading">
        <h2 id="activity-heading" className={styles.heading}>
          Agent activity
        </h2>
        <ActivityFeed items={activity} nodes={nodes} actions={actions} now={now} />
      </section>
    </aside>
  );
}
