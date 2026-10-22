"use client";

import { useEffect, useRef, useState } from "react";

import type { PendingAction } from "./types";

export interface ResolvedEntry {
  action: PendingAction;
  at: number;
}

export const RESOLVED_VISIBLE_MS = 12000;

/**
 * Actions that moved from pending to resolved while the page was open, kept
 * for a few seconds so the outcome of a click stays visible after the pending
 * card has gone.
 */
export function useRecentlyResolved(actions: Record<string, PendingAction>) {
  const previous = useRef<Record<string, string>>({});
  const [entries, setEntries] = useState<ResolvedEntry[]>([]);

  useEffect(() => {
    const fresh: ResolvedEntry[] = [];
    for (const action of Object.values(actions)) {
      if (previous.current[action.id] === "pending" && action.status !== "pending") {
        fresh.push({ action, at: Date.now() });
      }
    }
    previous.current = Object.fromEntries(Object.values(actions).map((a) => [a.id, a.status]));
    if (fresh.length) setEntries((prev) => [...fresh, ...prev]);
  }, [actions]);

  useEffect(() => {
    if (entries.length === 0) return;
    const oldest = Math.min(...entries.map((e) => e.at));
    const timer = setTimeout(
      () => setEntries((prev) => prev.filter((e) => Date.now() - e.at < RESOLVED_VISIBLE_MS)),
      Math.max(RESOLVED_VISIBLE_MS - (Date.now() - oldest), 50) + 20,
    );
    return () => clearTimeout(timer);
  }, [entries]);

  const dismiss = (id: string) => setEntries((prev) => prev.filter((e) => e.action.id !== id));

  return { entries, dismiss };
}
