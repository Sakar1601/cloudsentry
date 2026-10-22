"use client";

import type { ReactNode } from "react";

import styles from "./SpotlightTile.module.css";

export interface SpotlightTileProps {
  children: ReactNode;
  className?: string;
}

/** A tile whose surface lights up under the cursor. */
export default function SpotlightTile({ children, className }: SpotlightTileProps) {
  return (
    <div
      className={`${styles.tile} ${className ?? ""}`}
      onMouseMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        e.currentTarget.style.setProperty("--mx", `${e.clientX - rect.left}px`);
        e.currentTarget.style.setProperty("--my", `${e.clientY - rect.top}px`);
      }}
    >
      {children}
    </div>
  );
}
