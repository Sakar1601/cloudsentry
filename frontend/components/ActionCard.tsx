"use client";

import { useState } from "react";

import { resolveAction } from "@/lib/api";
import type { PendingAction } from "@/lib/types";

import styles from "./ActionCard.module.css";

function resolvedClass(status: string): string {
  if (status === "approved") return styles.resolvedApproved;
  if (status === "rejected") return styles.resolvedRejected;
  return styles.resolvedOther;
}

export interface ActionCardProps {
  action: PendingAction;
  x: number;
  y: number;
  /** Render in normal flow (e.g. a tray on small screens) instead of floating at x/y. */
  docked?: boolean;
}

function summarize(params: Record<string, unknown>): string {
  const [key, value] = Object.entries(params)[0] ?? [];
  if (key === undefined) return "";
  return `${key}: ${typeof value === "string" ? value : JSON.stringify(value)}`;
}

export default function ActionCard({ action, x, y, docked = false }: ActionCardProps) {
  const [submitting, setSubmitting] = useState(false);
  const [expanded, setExpanded] = useState(false);

  async function resolve(decision: "approve" | "reject") {
    setSubmitting(true);
    try {
      await resolveAction(action.id, decision);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={`${styles.card} ${docked ? styles.docked : ""}`} style={docked ? undefined : { left: x, top: y }} data-testid={`action-card-${action.id}`}>
      <div className={styles.header}>
        <span className={styles.toolName}>{action.tool_name}</span>
        {action.status === "pending" && <span className={styles.badge}>Pending</span>}
      </div>
      <p className={styles.target}>on {action.node_id.split(":")[1] ?? action.node_id}</p>
      <p className={styles.summary}>{summarize(action.params)}</p>
      <button
        type="button"
        className={styles.toggle}
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
      >
        {expanded ? "Hide details" : "Show exact change"}
      </button>
      {expanded && (
        <div className={styles.details}>
          <pre className={styles.params}>{JSON.stringify(action.params, null, 2)}</pre>
          {action.proposed_reasoning && <p className={styles.reasoning}>{action.proposed_reasoning}</p>}
        </div>
      )}
      {action.status === "pending" ? (
        <div className={styles.buttons}>
          <button className={styles.approve} disabled={submitting} onClick={() => resolve("approve")}>
            Approve
          </button>
          <button className={styles.reject} disabled={submitting} onClick={() => resolve("reject")}>
            Reject
          </button>
        </div>
      ) : (
        <span className={`${styles.resolved} ${resolvedClass(action.status)}`}>{action.status}</span>
      )}
    </div>
  );
}
