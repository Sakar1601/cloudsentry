import styles from "./WhyVisuals.module.css";

/* Small animated illustrations for the "what is different" tiles. Pure SVG + CSS. */

export function MapVisual() {
  return (
    <svg viewBox="0 0 320 170" className={styles.svg} aria-hidden="true">
      <g stroke="rgba(255,255,255,.14)" strokeWidth="1.4" fill="none">
        <path d="M70 95 L150 50" />
        <path d="M150 50 L240 80" />
        <path d="M70 95 L130 135" />
        <path d="M130 135 L240 80" strokeDasharray="3 5" />
      </g>
      <g className={styles.flow} stroke="rgba(90,168,255,.7)" strokeWidth="1.6" fill="none">
        <path d="M70 95 L150 50" />
        <path d="M150 50 L240 80" />
      </g>
      {[
        [70, 95, "#46d9a0"],
        [150, 50, "#5aa8ff"],
        [240, 80, "#e2a66b"],
        [130, 135, "#5aa8ff"],
      ].map(([x, y, c], i) => (
        <g key={i}>
          <circle cx={x as number} cy={y as number} r="22" fill={c as string} opacity=".12" />
          <circle cx={x as number} cy={y as number} r="11" fill="#080b11" stroke={c as string} strokeWidth="2" />
        </g>
      ))}
      <g className={styles.orbit} style={{ transformOrigin: "150px 50px" }}>
        <circle cx="150" cy="22" r="5" fill="#f5a623" />
        <circle cx="150" cy="22" r="10" fill="#f5a623" opacity=".25" />
      </g>
      <rect x="168" y="14" width="96" height="30" rx="8" fill="#0e131c" stroke="rgba(255,255,255,.14)" />
      <text x="180" y="33" fontSize="11" fill="#9aa4b6" fontFamily="var(--font-sans)">
        spend is 2.2× baseline
      </text>
    </svg>
  );
}

export function GateVisual() {
  return (
    <svg viewBox="0 34 320 82" className={styles.svg} aria-hidden="true">
      <g fontFamily="var(--font-sans)" fontSize="11" fill="#c8d0de">
        <rect x="8" y="48" width="70" height="34" rx="10" fill="#111722" stroke="rgba(255,255,255,.16)" />
        <text x="43" y="69" textAnchor="middle">Agent</text>
        <rect x="116" y="48" width="84" height="34" rx="10" fill="#111722" stroke="rgba(245,185,66,.5)" />
        <text x="158" y="69" textAnchor="middle">Pending</text>
        <rect x="238" y="48" width="74" height="34" rx="10" fill="#111722" stroke="rgba(255,255,255,.16)" />
        <text x="275" y="69" textAnchor="middle">AWS</text>
      </g>
      <path d="M78 65 H114" stroke="rgba(255,255,255,.3)" strokeWidth="1.6" />
      <path className={styles.march} d="M200 65 H236" stroke="#5aa8ff" strokeWidth="2" strokeDasharray="4 5" />
      <g className={styles.gate}>
        <circle cx="219" cy="65" r="13" fill="#0b1c33" stroke="#5aa8ff" strokeWidth="1.6" />
        <path d="M213 65 l4.5 4.5 l8-9" stroke="#5aa8ff" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <text x="219" y="102" textAnchor="middle" fontSize="10.5" fill="#69748a" fontFamily="var(--font-sans)">
        human click
      </text>
    </svg>
  );
}

export function BaselineVisual() {
  return (
    <svg viewBox="0 12 320 96" className={styles.svg} aria-hidden="true">
      <line x1="10" y1="82" x2="310" y2="82" stroke="rgba(255,255,255,.14)" strokeDasharray="3 5" />
      <line x1="10" y1="52" x2="310" y2="52" stroke="rgba(245,185,66,.45)" strokeDasharray="5 5" />
      <text x="14" y="46" fontSize="10" fill="rgba(245,185,66,.85)" fontFamily="var(--font-sans)">
        1.5× baseline
      </text>
      <path
        className={styles.draw}
        d="M10 86 L40 80 L70 88 L100 82 L130 85 L160 79 L190 84 L215 30 L240 36 L270 84 L310 82"
        fill="none"
        stroke="#5aa8ff"
        strokeWidth="2.2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx="215" cy="30" r="12" className={styles.ping} fill="rgba(245,185,66,.35)" />
      <circle cx="215" cy="30" r="4.5" fill="#f5b942" />
    </svg>
  );
}

export function GraphVisual() {
  return (
    <svg viewBox="40 8 240 124" className={styles.svg} aria-hidden="true">
      <g stroke="rgba(255,255,255,.16)" strokeWidth="1.5">
        <line x1="160" y1="36" x2="90" y2="96" />
        <line x1="160" y1="36" x2="230" y2="96" />
        <line x1="90" y1="96" x2="230" y2="96" />
      </g>
      <circle className={styles.p1} r="3.2" fill="#f5a623" />
      <circle className={styles.p2} r="3.2" fill="#a78bfa" />
      <circle className={styles.p3} r="3.2" fill="#f2545b" />
      {[
        [160, 36, "#f5a623"],
        [90, 96, "#a78bfa"],
        [230, 96, "#f2545b"],
      ].map(([x, y, c], i) => (
        <g key={i}>
          <circle cx={x as number} cy={y as number} r="22" fill={c as string} opacity=".14" />
          <circle cx={x as number} cy={y as number} r="11" fill="#080b11" stroke={c as string} strokeWidth="2" />
        </g>
      ))}
    </svg>
  );
}

export function AuditVisual() {
  const rows = [
    ["Security", "tighten_iam_policy", "approved", "#3ecf8e"],
    ["Cost", "stop_ec2_instance", "rejected", "#9aa3b5"],
    ["Performance", "resize_ec2_instance", "pending", "#f5b942"],
  ];
  return (
    <div className={styles.audit} aria-hidden="true">
      {rows.map(([agent, tool, status, color], i) => (
        <div key={tool} className={styles.auditRow} style={{ animationDelay: `${i * 140}ms` }}>
          <span className={styles.auditAgent}>{agent}</span>
          <span className={styles.auditTool}>{tool}</span>
          <span className={styles.auditPill} style={{ color, background: `${color}22` }}>
            {status}
          </span>
        </div>
      ))}
    </div>
  );
}

export function BoundaryVisual() {
  return (
    <svg viewBox="0 0 320 130" className={styles.svg} aria-hidden="true">
      <rect x="8" y="14" width="190" height="104" rx="14" fill="none" stroke="rgba(90,168,255,.5)" strokeDasharray="5 5" />
      <text x="20" y="34" fontSize="10.5" fill="#5aa8ff" fontFamily="var(--font-sans)">
        Your AWS account
      </text>
      <rect x="26" y="50" width="94" height="40" rx="10" fill="#111722" stroke="rgba(255,255,255,.18)" />
      <text x="73" y="74" textAnchor="middle" fontSize="11.5" fill="#d7deea" fontFamily="var(--font-sans)">
        Cloudsentry
      </text>
      <rect x="226" y="50" width="86" height="40" rx="10" fill="#111722" stroke="rgba(255,255,255,.18)" />
      <text x="269" y="74" textAnchor="middle" fontSize="11.5" fill="#d7deea" fontFamily="var(--font-sans)">
        Claude API
      </text>
      <path className={styles.march} d="M122 70 H224" stroke="rgba(255,255,255,.4)" strokeWidth="1.6" strokeDasharray="4 5" />
      <text x="172" y="62" textAnchor="middle" fontSize="10" fill="#69748a" fontFamily="var(--font-sans)">
        tool results only
      </text>
    </svg>
  );
}
