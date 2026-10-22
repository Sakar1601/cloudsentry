import Link from "next/link";

import { STATIC_DEMO } from "@/lib/api";

import styles from "./Header.module.css";

type NavId = "overview" | "graph" | "audit";

// In the static demo "/" is the explainer and the app lives at /demo.
const NAV_ITEMS: { href: string; label: string; id: NavId }[] = STATIC_DEMO
  ? [
      { href: "/", label: "Overview", id: "overview" },
      { href: "/demo", label: "Live graph", id: "graph" },
      { href: "/audit", label: "Audit log", id: "audit" },
    ]
  : [
      { href: "/", label: "Graph", id: "graph" },
      { href: "/audit", label: "Audit Log", id: "audit" },
    ];

export interface HeaderProps {
  active: NavId;
}

export default function Header({ active }: HeaderProps) {
  return (
    <header className={styles.header}>
      <Link href="/" className={styles.brand}>
        <span className={styles.mark} aria-hidden="true" />
        <span className={styles.title}>Cloudsentry</span>
      </Link>
      {STATIC_DEMO && (
        <span className={styles.demoBadge} title="Runs entirely in your browser against a simulated AWS account">
          Interactive demo · simulated AWS account
        </span>
      )}
      <nav className={styles.nav}>
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`${styles.navLink} ${item.id === active ? styles.navLinkActive : ""}`}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
