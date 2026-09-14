"use client";

import { useState } from "react";

import type { PendingAction } from "@/lib/types";

import styles from "./ActionCard.module.css";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export interface ActionCardProps {
  action: PendingAction;
  x: number;
  y: number;
}

export default function ActionCard({ action, x, y }: ActionCardProps) {
  const [submitting, setSubmitting] = useState(false);

  async function resolve(decision: "approve" | "reject") {
    setSubmitting(true);
    try {
      await fetch(`${API_BASE_URL}/actions/${action.id}/${decision}`, { method: "POST" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.card} style={{ left: x, top: y }} data-testid={`action-card-${action.id}`}>
      <div className={styles.toolName}>{action.tool_name}</div>
      <pre className={styles.params}>{JSON.stringify(action.params, null, 2)}</pre>
      {action.proposed_reasoning && <p className={styles.reasoning}>{action.proposed_reasoning}</p>}
      {action.status === "pending" ? (
        <div className={styles.buttons}>
          <button disabled={submitting} onClick={() => resolve("approve")}>
            Approve
          </button>
          <button disabled={submitting} onClick={() => resolve("reject")}>
            Reject
          </button>
        </div>
      ) : (
        <div className={styles.resolved}>{action.status}</div>
      )}
    </div>
  );
}
