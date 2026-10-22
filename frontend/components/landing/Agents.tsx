import Reveal from "./Reveal";
import styles from "./landing.module.css";

interface AgentRow {
  id: "cost" | "performance" | "security";
  name: string;
  color: string;
  looksFor: string;
  picks: string;
  reads: string[];
  proposes: string;
}

const AGENTS: AgentRow[] = [
  {
    id: "cost",
    name: "Cost",
    color: "var(--agent-cost)",
    looksFor: "Spend that has drifted above what the resource needs.",
    picks: "A node whose 7-day cost is more than 1.5× its own rolling baseline.",
    reads: ["get_cost_and_usage", "list_ec2_instances", "list_lambda_functions"],
    proposes: "stop_ec2_instance",
  },
  {
    id: "performance",
    name: "Performance",
    color: "var(--agent-performance)",
    looksFor: "Latency and CPU pressure that the workload is not sized for.",
    picks: "A node whose primary CloudWatch metric is more than 1.5× its rolling baseline.",
    reads: ["get_cloudwatch_metric", "get_cloudwatch_logs", "list_lambda_functions", "list_ec2_instances"],
    proposes: "resize_ec2_instance",
  },
  {
    id: "security",
    name: "Security",
    color: "var(--agent-security)",
    looksFor: "IAM roles that grant more than the function actually uses.",
    picks: "Each Lambda function in turn, so every execution role gets reviewed.",
    reads: ["get_iam_policy_for_role", "list_ec2_instances", "list_lambda_functions"],
    proposes: "tighten_iam_policy",
  },
];

const ROWS: { label: string; render: (a: AgentRow) => React.ReactNode }[] = [
  { label: "Looks for", render: (a) => a.looksFor },
  { label: "Investigates when", render: (a) => a.picks },
  {
    label: "Can read with",
    render: (a) => (
      <ul className={styles.toolList}>
        {a.reads.map((tool) => (
          <li key={tool}>{tool}</li>
        ))}
      </ul>
    ),
  },
  { label: "Can only propose", render: (a) => <span className={styles.toolList}>{a.proposes}</span> },
];

export default function Agents() {
  return (
    <section id="agents" className={`${styles.section} ${styles.sectionAlt}`}>
      <div className={styles.container}>
        <Reveal className={styles.sectionHead}>
          <h2 className={styles.h2}>Three agents, each with a narrow job.</h2>
          <p className={styles.sectionLead}>
            Each agent is its own Claude tool-use loop on its own cadence, with a toolset limited to what its job
            needs. None of them can change anything on their own.
          </p>
        </Reveal>

        <Reveal>
        <div className={styles.agentGrid} role="table" aria-label="What each agent does">
          <div className={styles.agentHeadRow} role="row">
            <span role="columnheader">
              <span className={styles.srOnly}>Attribute</span>
            </span>
            {AGENTS.map((agent) => (
              <span key={agent.id} role="columnheader" className={styles.agentName}>
                <span className={styles.agentDot} style={{ background: agent.color }} aria-hidden="true" />
                {agent.name}
              </span>
            ))}
          </div>
          {ROWS.map((row) => (
            <div key={row.label} className={styles.agentRow} role="row">
              <span role="rowheader" className={styles.rowLabel}>
                {row.label}
              </span>
              {AGENTS.map((agent) => (
                <div key={agent.id} role="cell" className={styles.agentCell} data-agent={agent.name}>
                  {row.render(agent)}
                </div>
              ))}
            </div>
          ))}
        </div>
        </Reveal>
      </div>
    </section>
  );
}
