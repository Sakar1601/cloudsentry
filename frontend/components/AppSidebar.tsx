"use client";

import ActionCard from "@/components/ActionCard";
import ActivityFeed from "@/components/ActivityFeed";
import AnimatedNumber from "@/components/AnimatedNumber";
import OutcomeCard from "@/components/OutcomeCard";
import type { ActivityItem, ConnectionStatus, GraphNode, PendingAction } from "@/lib/types";
import { useNow } from "@/lib/useNow";
import type { ResolvedEntry } from "@/lib/useRecentlyResolved";

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
  /** The API needs a token the operator has not entered yet. */
  locked?: boolean;
  /** Actions resolved a moment ago, shown with what happened. */
  resolved?: ResolvedEntry[];
  onDismissResolved?: (id: string) => void;
}

export default function AppSidebar({ nodes, actions, activity, connection, simulated, locked = false, resolved = [], onDismissResolved }: AppSidebarProps) {
  const now = useNow();
  const nodeList = Object.values(nodes);
  const pending = Object.values(actions).filter((a) => a.status === "pending");
  const totalCost = nodeList.reduce((sum, n) => sum + (n.cost_7d ?? 0), 0);

  return (
    <aside className={styles.sidebar} aria-label="Account overview">
      <div className={styles.status}>
        <span className={`${styles.statusDot} ${locked ? styles.closed : styles[connection]}`} aria-hidden="true" />
        <span>
          {locked
            ? "Locked: enter the API token"
            : simulated && connection === "live"
              ? "Live simulation"
              : STATUS_LABELS[connection]}
        </span>
      </div>

      <dl className={styles.summary}>
        <div>
          <dt>Resources</dt>
          <dd>
            <AnimatedNumber value={nodeList.length} />
          </dd>
        </div>
        <div>
          <dt>7-day cost</dt>
          <dd>
            <AnimatedNumber value={totalCost} format={(n) => `$${Math.round(n)}`} />
          </dd>
        </div>
        <div>
          <dt>Need approval</dt>
          <dd className={pending.length > 0 ? styles.attention : undefined}>
            <AnimatedNumber value={pending.length} />
          </dd>
        </div>
      </dl>

      <section className={styles.section} aria-labelledby="approvals-heading">
        <h2 id="approvals-heading" className={styles.heading}>
          Awaiting your approval
        </h2>
        {resolved.length > 0 && (
          <div className={styles.cards} aria-live="polite">
            {resolved.map((entry) => (
              <OutcomeCard
                key={`out-${entry.action.id}`}
                action={entry.action}
                onDismiss={() => onDismissResolved?.(entry.action.id)}
              />
            ))}
          </div>
        )}
        {pending.length === 0 && resolved.length === 0 ? (
          <p className={styles.empty}>
            Nothing waiting. When an agent proposes a change, the exact action appears here and nothing runs until
            you approve it.
          </p>
        ) : (
          pending.length > 0 && (
            <div className={styles.cards}>
              {pending.map((action) => (
                <ActionCard key={action.id} action={action} x={0} y={0} docked />
              ))}
            </div>
          )
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
