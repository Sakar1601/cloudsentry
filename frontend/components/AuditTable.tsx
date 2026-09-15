import type { PendingAction } from "@/lib/types";

import styles from "./AuditTable.module.css";

function pillClass(status: string): string {
  if (status === "pending") return styles.pillPending;
  if (status === "approved") return styles.pillApproved;
  return styles.pillRejected;
}

export interface AuditTableProps {
  actions: PendingAction[];
}

export default function AuditTable({ actions }: AuditTableProps) {
  if (actions.length === 0) {
    return (
      <div className={styles.empty}>
        <span className={styles.emptyTitle}>No actions have been proposed yet.</span>
        Once an agent proposes stopping an instance, resizing one, or tightening a policy, it
        appears here — approved or rejected, with a timestamp for both.
      </div>
    );
  }

  return (
    <div className={styles.panel}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Created</th>
            <th>Agent</th>
            <th>Node</th>
            <th>Tool</th>
            <th>Status</th>
            <th>Resolved</th>
          </tr>
        </thead>
        <tbody>
          {actions.map((action) => (
            <tr key={action.id}>
              <td className={styles.mono}>{action.created_at}</td>
              <td className={styles.agentCell}>{action.agent_id}</td>
              <td className={styles.mono}>{action.node_id}</td>
              <td className={styles.mono}>{action.tool_name}</td>
              <td>
                <span className={`${styles.pill} ${pillClass(action.status)}`}>{action.status}</span>
              </td>
              <td className={styles.mono}>{action.resolved_at ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
