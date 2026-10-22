"use client";

import { Fragment, useState } from "react";

import type { PendingAction } from "@/lib/types";

import styles from "./AuditTable.module.css";

const AGENT_COLORS: Record<string, string> = {
  cost: "var(--agent-cost)",
  performance: "var(--agent-performance)",
  security: "var(--agent-security)",
};

function pillClass(status: string): string {
  if (status === "pending") return styles.pillPending;
  if (status === "approved") return styles.pillApproved;
  return styles.pillRejected;
}

// The backend stores naive UTC timestamps; read them as UTC and show local time.
function formatTime(value: string | null): string {
  if (!value) return "—";
  const date = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(value) ? value : `${value}Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

export interface AuditTableProps {
  actions: PendingAction[];
}

export default function AuditTable({ actions }: AuditTableProps) {
  const [openId, setOpenId] = useState<string | null>(null);

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
            <th aria-label="Details" />
            <th>Created</th>
            <th>Agent</th>
            <th>Node</th>
            <th>Tool</th>
            <th>Status</th>
            <th>Resolved</th>
          </tr>
        </thead>
        <tbody>
          {actions.map((action) => {
            const open = openId === action.id;
            return (
              <Fragment key={action.id}>
                <tr className={open ? styles.rowOpen : undefined}>
                  <td className={styles.toggleCell}>
                    <button
                      type="button"
                      className={styles.toggle}
                      aria-expanded={open}
                      aria-label={open ? "Hide details" : "Show details"}
                      onClick={() => setOpenId(open ? null : action.id)}
                    >
                      <span className={open ? styles.chevronOpen : styles.chevron} aria-hidden="true" />
                    </button>
                  </td>
                  <td className={styles.mono}>{formatTime(action.created_at)}</td>
                  <td className={styles.agentCell}>
                    <span className={styles.agentDot} style={{ background: AGENT_COLORS[action.agent_id] ?? "var(--node-default)" }} />
                    {action.agent_id}
                  </td>
                  <td className={styles.mono}>{action.node_id}</td>
                  <td className={styles.mono}>{action.tool_name}</td>
                  <td>
                    <span className={`${styles.pill} ${pillClass(action.status)}`}>{action.status}</span>
                  </td>
                  <td className={styles.mono}>{formatTime(action.resolved_at)}</td>
                </tr>
                {open && (
                  <tr className={styles.detailRow}>
                    <td />
                    <td colSpan={6}>
                      <div className={styles.detail}>
                        <div>
                          <h4 className={styles.detailHeading}>Exact change proposed</h4>
                          <pre className={styles.json}>{JSON.stringify(action.params, null, 2)}</pre>
                        </div>
                        <div>
                          <h4 className={styles.detailHeading}>Agent reasoning</h4>
                          <p className={styles.reasoning}>{action.proposed_reasoning ?? "No reasoning recorded."}</p>
                          <h4 className={styles.detailHeading}>Outcome</h4>
                          <pre className={styles.json}>
                            {action.result ? JSON.stringify(action.result, null, 2) : "Not executed."}
                          </pre>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
