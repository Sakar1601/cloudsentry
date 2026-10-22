import Reveal from "./Reveal";
import SpotlightTile from "./SpotlightTile";
import { AuditVisual, BaselineVisual, BoundaryVisual, GateVisual, GraphVisual, MapVisual } from "./WhyVisuals";
import styles from "./landing.module.css";

type Column = "dashboards" | "scanners" | "chat" | "cloudsentry";

const COLUMNS: { id: Column; label: string }[] = [
  { id: "dashboards", label: "Dashboards and alerts" },
  { id: "scanners", label: "Cost and security scanners" },
  { id: "chat", label: "Chat copilots" },
  { id: "cloudsentry", label: "Cloudsentry" },
];

const ROWS: { label: string; cells: Record<Column, string> }[] = [
  {
    label: "How a problem is found",
    cells: {
      dashboards: "You watch charts, or wait for a threshold alert.",
      scanners: "A periodic report of findings.",
      chat: "You have to ask the right question.",
      cloudsentry: "Agents notice what deviates from that resource's own baseline.",
    },
  },
  {
    label: "Who investigates",
    cells: {
      dashboards: "You.",
      scanners: "You triage the list.",
      chat: "The model, once you ask.",
      cloudsentry: "Three specialist agents, continuously.",
    },
  },
  {
    label: "Where the answer appears",
    cells: {
      dashboards: "Across tabs and consoles.",
      scanners: "A list, one domain per tool.",
      chat: "A chat transcript.",
      cloudsentry: "On the resource itself, in one graph.",
    },
  },
  {
    label: "How a fix happens",
    cells: {
      dashboards: "You change it by hand.",
      scanners: "By hand, or automatically by rule.",
      chat: "You copy a suggestion into the console.",
      cloudsentry: "One click on the exact change, gated and logged.",
    },
  },
];

const DIFFERENCES: {
  title: string;
  body: string;
  proof: string;
  visual: React.ReactNode;
  size: "wide" | "tall" | "normal" | "full";
}[] = [
  {
    title: "The investigation happens on the map",
    body: "An agent travels to the resource it is examining, and its finding and proposed fix are pinned there. You see where the problem is and what is connected to it, instead of reading about it in a transcript.",
    proof: "Press Trigger an incident in the demo above.",
    visual: <MapVisual />,
    size: "wide",
  },
  {
    title: "The model cannot pull the trigger",
    body: "Action tools only record intent. One endpoint executes, behind a human click, and the IAM role can only write to instances you have tagged. The safety does not depend on the model behaving.",
    proof: "See Safety below, and infra/terraform/iam.",
    visual: <GateVisual />,
    size: "tall",
  },
  {
    title: "Anomalies are relative, not hand-tuned",
    body: "Cost and Performance agents flag a resource running more than 1.5× above its own rolling baseline. No per-resource thresholds, and a busy service is not flagged for being busy.",
    proof: "backend/app/agents/selection.py",
    visual: <BaselineVisual />,
    size: "normal",
  },
  {
    title: "One graph for cost, performance and security",
    body: "Edges come from real signals: shared VPCs, Lambda environment variables, IAM access. Three specialists reason about the same connected picture.",
    proof: "Click a node, then follow its edges.",
    visual: <GraphVisual />,
    size: "normal",
  },
  {
    title: "Every decision leaves evidence",
    body: "Agent, node, exact parameters, reasoning, timestamps and outcome, including failures.",
    proof: "Approve something, then open the Audit log.",
    visual: <AuditVisual />,
    size: "normal",
  },
  {
    title: "It runs in your account",
    body: "A single service you deploy yourself with Terraform. It reads your account directly and sends only the tool results an agent asks for to the Claude API. There is no hosted control plane to trust.",
    proof: "infra/ and docker-compose.yml",
    visual: <BoundaryVisual />,
    size: "full",
  },
];

export default function Why() {
  return (
    <section id="why" className={`${styles.section} ${styles.sectionAlt}`}>
      <div className={styles.container}>
        <Reveal className={styles.sectionHead}>
          <h2 className={styles.h2}>Dashboards show. Scanners list. Chatbots wait. Cloudsentry investigates.</h2>
          <p className={styles.sectionLead}>
            Plenty of tools help you understand an AWS account. They mostly leave the investigating, and the
            fixing, to you. Cloudsentry takes both on, and keeps you in charge of what actually changes.
          </p>
        </Reveal>

        <Reveal>
        <div className={styles.compare} role="table" aria-label="How Cloudsentry compares with common approaches">
          <div className={styles.compareHead} role="row">
            <span role="columnheader">
              <span className={styles.srOnly}>Question</span>
            </span>
            {COLUMNS.map((c) => (
              <span
                key={c.id}
                role="columnheader"
                className={c.id === "cloudsentry" ? styles.compareUs : undefined}
              >
                {c.label}
              </span>
            ))}
          </div>
          {ROWS.map((row) => (
            <div key={row.label} className={styles.compareRow} role="row">
              <span role="rowheader" className={styles.compareLabel}>
                {row.label}
              </span>
              {COLUMNS.map((c) => (
                <div
                  key={c.id}
                  role="cell"
                  data-col={c.label}
                  className={`${styles.compareCell} ${c.id === "cloudsentry" ? styles.compareUsCell : ""}`}
                >
                  {row.cells[c.id]}
                </div>
              ))}
            </div>
          ))}
        </div>
        </Reveal>
        <p className={styles.compareNote}>
          Typical behavior of each category, not a review of any specific product. Many tools blur these lines.
        </p>

        <h3 className={styles.differenceHeading}>What is different here</h3>
        <div className={styles.bento}>
          {DIFFERENCES.map((d, i) => (
            <Reveal key={d.title} delay={i * 70} className={`${styles.bentoCell} ${styles[`cell_${d.size}`]}`}>
              <SpotlightTile className={styles.bentoTile}>
                <div className={styles.bentoVisual}>{d.visual}</div>
                <div className={styles.bentoText}>
                  <h4 className={styles.h3}>{d.title}</h4>
                  <p className={styles.body}>{d.body}</p>
                  <p className={styles.proof2}>{d.proof}</p>
                </div>
              </SpotlightTile>
            </Reveal>
          ))}
        </div>

        <div className={styles.limits}>
          <h3 className={styles.h3}>Where it is not the right tool (yet)</h3>
          <p className={styles.body}>
            Cloudsentry targets a single AWS account with a single operator, and covers EC2, Lambda, DynamoDB, Cost
            Explorer, CloudWatch and IAM, not the whole of AWS. The graph is held in memory, the Terraform guardrails are
            demo-grade rather than a production permissions boundary, and there are no user accounts or multi-tenant
            support. Those are deliberate scope limits, listed in the spec.
          </p>
        </div>
      </div>
    </section>
  );
}
