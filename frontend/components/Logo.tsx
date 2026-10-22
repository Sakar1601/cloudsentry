import styles from "./Logo.module.css";

/*
  The Cloudsentry mark: a central "eye" node (the sentry) wired to three
  agent nodes, coloured as the Cost (amber), Performance (violet) and Security
  (red) agents are everywhere else in the UI. Geometry mirrors
  public/logo-mark.svg and app/icon.svg, keep them in sync.
*/

export interface LogoMarkProps {
  size?: number;
  /** Draw the rounded dark tile behind the mark (use on any background). */
  tile?: boolean;
  className?: string;
}

export function LogoMark({ size = 28, tile = true, className }: LogoMarkProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden="true"
      focusable="false"
    >
      {tile && (
        <>
          <rect width="64" height="64" rx="15" fill="#0a0d12" />
          <rect x=".75" y=".75" width="62.5" height="62.5" rx="14.25" fill="none" stroke="#232a35" strokeWidth="1.5" />
        </>
      )}
      <circle cx="32" cy="32" r="21" fill="none" stroke="#2b3647" strokeWidth="1.6" />
      <g stroke="#5a6a82" strokeWidth="2.4" strokeLinecap="round">
        <line x1="32" y1="32" x2="32" y2="11" />
        <line x1="32" y1="32" x2="50.19" y2="42.5" />
        <line x1="32" y1="32" x2="13.81" y2="42.5" />
      </g>
      <circle cx="32" cy="11" r="5.6" fill="#f5a623" />
      <circle cx="50.19" cy="42.5" r="5.6" fill="#a78bfa" />
      <circle cx="13.81" cy="42.5" r="5.6" fill="#f2545b" />
      <circle cx="32" cy="32" r="9.6" fill="#4da3ff" />
      <circle cx="32" cy="32" r="4" fill="#0a0d12" />
      <circle cx="30.6" cy="30.4" r="1.3" fill="#cfe6ff" />
    </svg>
  );
}

export interface LogoProps {
  size?: number;
  className?: string;
}

/** Mark + wordmark lockup. */
export default function Logo({ size = 28, className }: LogoProps) {
  return (
    <span className={`${styles.logo} ${className ?? ""}`} style={{ gap: size * 0.4 }}>
      <LogoMark size={size} />
      <span className={styles.word} style={{ fontSize: size * 0.72 }}>
        Cloudsentry
      </span>
    </span>
  );
}
