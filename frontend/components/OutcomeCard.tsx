import Link from "next/link";

import { describeOutcome } from "@/lib/outcome";
import type { PendingAction } from "@/lib/types";

import styles from "./OutcomeCard.module.css";

export interface OutcomeCardProps {
  action: PendingAction;
  onDismiss?: () => void;
  /** Render in normal flow (sidebar / tray) instead of floating. */
  docked?: boolean;
}

/** What happened after Approve or Reject, shown where the pending card was. */
export default function OutcomeCard({ action, onDismiss }: OutcomeCardProps) {
  const outcome = describeOutcome(action);
  const node = action.node_id.split(":")[1] ?? action.node_id;

  return (
    <div className={`${styles.card} ${styles[outcome.tone]}`} role="status" data-testid={`outcome-${action.id}`}>
      <span className={styles.icon} aria-hidden="true">
        {outcome.tone === "success" ? "✓" : outcome.tone === "rejected" ? "–" : "!"}
      </span>
      <div className={styles.body}>
        <p className={styles.title}>{outcome.title}</p>
        <p className={styles.node}>on {node}</p>
        <p className={styles.detail}>{outcome.detail}</p>
        <Link href="/audit" className={styles.link}>
          View in audit log →
        </Link>
      </div>
      {onDismiss && (
        <button type="button" className={styles.dismiss} onClick={onDismiss} aria-label="Dismiss">
          ×
        </button>
      )}
    </div>
  );
}
