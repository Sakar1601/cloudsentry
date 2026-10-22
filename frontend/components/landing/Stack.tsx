import styles from "./landing.module.css";

const ROWS: { layer: string; what: string; tech: string }[] = [
  {
    layer: "Agents",
    what: "Three Claude tool-use loops, each with its own scoped toolset and a bounded number of calls.",
    tech: "Anthropic API",
  },
  {
    layer: "API",
    what: "REST plus a WebSocket that streams graph deltas, agent moves, findings and proposals.",
    tech: "FastAPI, uvicorn, asyncio",
  },
  {
    layer: "AWS access",
    what: "Thin boto3 wrappers over EC2, Lambda, DynamoDB, CloudWatch, Cost Explorer and IAM.",
    tech: "boto3",
  },
  {
    layer: "State",
    what: "In-memory graph rebuilt by the poller; pending actions and the audit log in SQLite.",
    tech: "SQLite",
  },
  {
    layer: "Frontend",
    what: "Force-directed graph with agent markers, findings and approval cards tracked to node coordinates.",
    tech: "Next.js 16, React, TypeScript, react-force-graph-2d",
  },
  {
    layer: "Infrastructure",
    what: "Least-privilege task role and an always-on Fargate service for the background loops.",
    tech: "Terraform (iam, ecs), Docker",
  },
  {
    layer: "Quality",
    what: "121 backend tests and 28 frontend tests, type-checking, a production build and Terraform validation on every push.",
    tech: "pytest, vitest, GitHub Actions",
  },
  {
    layer: "This page",
    what: "The same UI and message protocol, served by an in-browser simulator instead of the backend, exported as static files.",
    tech: "Next.js static export, GitHub Pages",
  },
];

export default function Stack() {
  return (
    <section id="stack" className={`${styles.section} ${styles.sectionAlt}`}>
      <div className={styles.container}>
        <div className={styles.sectionHead}>
          <h2 className={styles.h2}>What is in the repository.</h2>
          <p className={styles.sectionLead}>
            A real service, not a mock-up. This page is a simulation of the account, not of the software.
          </p>
        </div>

        <table className={styles.stackTable}>
          <thead className={styles.srOnly}>
            <tr>
              <th scope="col">Layer</th>
              <th scope="col">What it does</th>
              <th scope="col">Built with</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr key={row.layer}>
                <th scope="row">{row.layer}</th>
                <td>{row.what}</td>
                <td className={styles.techCell}>{row.tech}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className={styles.runIt}>
          <div>
            <h3 className={styles.h3}>Run the real thing</h3>
            <p className={styles.body}>
              The backend runs against a live AWS account with an Anthropic key, and has been exercised that way. For a
              credential-free run of the full stack, use demo mode:
            </p>
          </div>
          <pre className={styles.codeBlock}>
            <code>{`git clone https://github.com/Sakar1601/cloudsentry
cd cloudsentry
docker compose up --build   # → http://localhost:3000`}</code>
          </pre>
        </div>
      </div>
    </section>
  );
}
