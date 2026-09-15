"use client";

import { useEffect, useState } from "react";

import AuditTable from "@/components/AuditTable";
import Header from "@/components/Header";
import type { PendingAction } from "@/lib/types";

import styles from "./page.module.css";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export default function AuditPage() {
  const [actions, setActions] = useState<PendingAction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE_URL}/actions`)
      .then((response) => response.json())
      .then((data: PendingAction[]) => {
        if (!cancelled) {
          setActions(data);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className={styles.main}>
      <Header active="audit" />
      <div className={styles.content}>
        <h1 className={styles.title}>Audit Log</h1>
        <p className={styles.subtitle}>Every action an agent has proposed, and how it was resolved.</p>
        {loading ? <p className={styles.loading}>Loading…</p> : <AuditTable actions={actions} />}
      </div>
    </main>
  );
}
