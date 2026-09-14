import type { PendingAction } from "@/lib/types";

import styles from "./AuditTable.module.css";

export interface AuditTableProps {
  actions: PendingAction[];
}

export default function AuditTable({ actions }: AuditTableProps) {
  if (actions.length === 0) {
    return <p className={styles.empty}>No actions have been proposed yet.</p>;
  }

  return (
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
            <td>{action.created_at}</td>
            <td>{action.agent_id}</td>
            <td>{action.node_id}</td>
            <td>{action.tool_name}</td>
            <td>{action.status}</td>
            <td>{action.resolved_at ?? "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
