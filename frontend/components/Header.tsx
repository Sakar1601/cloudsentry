import Link from "next/link";

import styles from "./Header.module.css";

const NAV_ITEMS: { href: string; label: string; id: "graph" | "audit" }[] = [
  { href: "/", label: "Graph", id: "graph" },
  { href: "/audit", label: "Audit Log", id: "audit" },
];

export interface HeaderProps {
  active: "graph" | "audit";
}

export default function Header({ active }: HeaderProps) {
  return (
    <header className={styles.header}>
      <Link href="/" className={styles.brand}>
        <span className={styles.mark} aria-hidden="true" />
        <span className={styles.title}>Cloudsentry</span>
      </Link>
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
