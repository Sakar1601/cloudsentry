import styles from "./landing.module.css";

// Hand-drawn system diagram. Coordinates are in a 1000×560 viewBox; the
// wrapper scrolls horizontally on narrow screens rather than shrinking the
// labels below legibility.

function Arrow({ id, color }: { id: string; color: string }) {
  return (
    <marker id={id} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill={color} />
    </marker>
  );
}

export default function Architecture() {
  return (
    <section id="architecture" className={styles.section}>
      <div className={styles.container}>
        <div className={styles.sectionHead}>
          <h2 className={styles.h2}>How the pieces fit.</h2>
          <p className={styles.sectionLead}>
            Reads flow freely. The only path that writes to AWS is the dashed one, and it starts with a person clicking
            approve.
          </p>
        </div>

        <div className={styles.diagramScroll}>
          <svg
            className={styles.diagram}
            viewBox="0 0 1000 560"
            role="img"
            aria-label="Architecture: the browser talks to a FastAPI service over WebSocket and REST. The service polls AWS, runs three agents that call the Anthropic API and read AWS, and stores proposed actions. Only an approved action is executed against AWS."
          >
            <defs>
              <Arrow id="a-muted" color="#5a6272" />
              <Arrow id="a-accent" color="#4da3ff" />
            </defs>

            {/* Browser */}
            <rect x="24" y="170" width="210" height="150" rx="14" className={styles.dBox} />
            <text x="129" y="205" className={styles.dTitle} textAnchor="middle">Browser</text>
            <text x="129" y="232" className={styles.dSub} textAnchor="middle">Next.js UI</text>
            <text x="129" y="254" className={styles.dSub} textAnchor="middle">force graph</text>
            <text x="129" y="276" className={styles.dSub} textAnchor="middle">agent markers</text>
            <text x="129" y="298" className={styles.dSub} textAnchor="middle">approval cards</text>

            {/* Terraform */}
            <rect x="24" y="400" width="210" height="110" rx="14" className={styles.dBoxDashed} />
            <text x="129" y="432" className={styles.dTitle} textAnchor="middle">Terraform</text>
            <text x="129" y="458" className={styles.dSub} textAnchor="middle">ECS Fargate service</text>
            <text x="129" y="480" className={styles.dSub} textAnchor="middle">least-privilege task role</text>

            {/* FastAPI container */}
            <rect x="330" y="40" width="360" height="470" rx="16" className={styles.dContainer} />
            <text x="350" y="70" className={styles.dTitle}>FastAPI service</text>

            <rect x="354" y="90" width="312" height="132" rx="10" className={styles.dBox} />
            <text x="372" y="118" className={styles.dLabel}>Agent swarm</text>
            <rect x="372" y="134" width="84" height="30" rx="15" fill="var(--agent-cost)" />
            <text x="414" y="154" className={styles.dChip} textAnchor="middle">Cost</text>
            <rect x="466" y="134" width="108" height="30" rx="15" fill="var(--agent-performance)" />
            <text x="520" y="154" className={styles.dChip} textAnchor="middle">Performance</text>
            <rect x="584" y="134" width="70" height="30" rx="15" fill="var(--agent-security)" />
            <text x="619" y="154" className={styles.dChip} textAnchor="middle">Security</text>
            <text x="372" y="196" className={styles.dSub}>each: bounded Claude tool-use loop</text>

            <rect x="354" y="252" width="312" height="62" rx="10" className={styles.dBox} />
            <text x="372" y="280" className={styles.dLabel}>Action store</text>
            <text x="372" y="302" className={styles.dSub}>SQLite · pending → approved | rejected</text>

            <rect x="354" y="344" width="312" height="52" rx="10" className={styles.dBoxGate} />
            <text x="372" y="376" className={styles.dLabel}>Approve endpoint → executor</text>

            <rect x="354" y="426" width="312" height="70" rx="10" className={styles.dBox} />
            <text x="372" y="454" className={styles.dLabel}>Graph poller</text>
            <text x="372" y="476" className={styles.dSub}>builds graph · diffs · broadcasts</text>

            {/* Anthropic */}
            <rect x="790" y="24" width="186" height="96" rx="14" className={styles.dBox} />
            <text x="883" y="64" className={styles.dTitle} textAnchor="middle">Anthropic API</text>
            <text x="883" y="90" className={styles.dSub} textAnchor="middle">Claude, tool use</text>

            {/* AWS */}
            <rect x="790" y="170" width="186" height="340" rx="14" className={styles.dBox} />
            <text x="883" y="208" className={styles.dTitle} textAnchor="middle">AWS account</text>
            {["EC2", "Lambda", "DynamoDB", "CloudWatch", "Cost Explorer", "IAM"].map((name, i) => (
              <text key={name} x="883" y={250 + i * 36} className={styles.dSub} textAnchor="middle">
                {name}
              </text>
            ))}

            {/* Browser ↔ API */}
            <line x1="330" y1="215" x2="236" y2="215" className={styles.dLine} markerEnd="url(#a-muted)" />
            <text x="283" y="203" className={styles.dNote} textAnchor="middle">WebSocket</text>
            <line x1="236" y1="285" x2="328" y2="285" className={styles.dLine} markerEnd="url(#a-muted)" />
            <text x="283" y="311" className={styles.dNote} textAnchor="middle">REST</text>

            {/* Agents → Anthropic */}
            <path d="M 666 120 C 720 118, 740 104, 788 94" className={styles.dLine} markerEnd="url(#a-muted)" fill="none" />
            <text x="727" y="96" className={styles.dNote} textAnchor="middle">reason</text>

            {/* Agents → AWS read tools */}
            <path d="M 666 190 C 720 195, 740 215, 788 232" className={styles.dLine} markerEnd="url(#a-muted)" fill="none" />
            <text x="716" y="184" className={styles.dNote} textAnchor="middle">read-only tools</text>

            {/* propose */}
            <line x1="510" y1="222" x2="510" y2="250" className={styles.dLine} markerEnd="url(#a-muted)" />
            <text x="524" y="242" className={styles.dNote}>propose</text>

            {/* human approves */}
            <line x1="510" y1="314" x2="510" y2="342" className={styles.dLine} markerEnd="url(#a-muted)" />
            <text x="524" y="334" className={styles.dNote}>human approves</text>

            {/* gated write */}
            <line x1="666" y1="370" x2="788" y2="370" className={styles.dGate} markerEnd="url(#a-accent)" />
            <text x="727" y="358" className={styles.dNoteAccent} textAnchor="middle">gated write</text>

            {/* Poller → AWS */}
            <line x1="666" y1="461" x2="788" y2="461" className={styles.dLine} markerEnd="url(#a-muted)" />
            <text x="727" y="449" className={styles.dNote} textAnchor="middle">read</text>
          </svg>
        </div>
      </div>
    </section>
  );
}
