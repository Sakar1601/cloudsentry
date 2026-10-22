"use client";

import { useEffect, useState } from "react";

import AuditTable from "@/components/AuditTable";
import Header from "@/components/Header";
import { getActions } from "@/lib/api";
import type { PendingAction } from "@/lib/types";

import styles from "./page.module.css";

export default function AuditPage() {
  const [actions, setActions] = useState<PendingAction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getActions().then((data: PendingAction[]) => {
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
