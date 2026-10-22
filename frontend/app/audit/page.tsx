"use client";

import { useEffect, useMemo, useState } from "react";

import AuditTable from "@/components/AuditTable";
import Header from "@/components/Header";
import { getActions } from "@/lib/api";
import type { PendingAction } from "@/lib/types";

import styles from "./page.module.css";

type Filter = "all" | "pending" | "approved" | "rejected";
const FILTERS: Filter[] = ["all", "pending", "approved", "rejected"];

export default function AuditPage() {
  const [actions, setActions] = useState<PendingAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");

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

  const counts = useMemo(() => {
    const c = { all: actions.length, pending: 0, approved: 0, rejected: 0 };
    for (const a of actions) if (a.status in c) c[a.status as Filter] += 1;
    return c;
  }, [actions]);
  const visible = filter === "all" ? actions : actions.filter((a) => a.status === filter);

  return (
    <main className={styles.main}>
      <Header active="audit" />
      <div className={styles.content}>
        <h1 className={styles.title}>Audit Log</h1>
        <p className={styles.subtitle}>Every action an agent has proposed, and how it was resolved.</p>
        {loading ? (
          <p className={styles.loading}>Loading…</p>
        ) : (
          <>
            {actions.length > 0 && (
              <div className={styles.filters} role="group" aria-label="Filter by status">
                {FILTERS.map((f) => (
                  <button
                    key={f}
                    type="button"
                    className={`${styles.filter} ${filter === f ? styles.filterActive : ""}`}
                    aria-pressed={filter === f}
                    onClick={() => setFilter(f)}
                  >
                    {f === "all" ? "All" : f[0].toUpperCase() + f.slice(1)}
                    <span className={styles.count}>{counts[f]}</span>
                  </button>
                ))}
              </div>
            )}
            <AuditTable actions={visible} />
          </>
        )}
      </div>
    </main>
  );
}
