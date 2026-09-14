"use client";

import { useEffect, useState } from "react";

import AuditTable from "@/components/AuditTable";
import type { PendingAction } from "@/lib/types";

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
    <main>
      <h1>Audit Log</h1>
      {loading ? <p>Loading…</p> : <AuditTable actions={actions} />}
    </main>
  );
}
