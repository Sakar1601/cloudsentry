import Reveal from "./Reveal";
import styles from "./landing.module.css";

const GUARANTEES = [
  {
    title: "Action tools are inert",
    body: "stop_ec2_instance, resize_ec2_instance and tighten_iam_policy do not call AWS. Invoking one writes a pending row with the exact parameters.",
  },
  {
    title: "Execution lives in one place",
    body: "Only the approve endpoint runs the change, through a separate executor. Approving twice returns a conflict; rejecting runs nothing.",
  },
  {
    title: "The blast radius is capped in IAM",
    body: "In the Terraform task role, writes apply only to EC2 instances tagged CloudsentryManaged=true, and IAM edits exclude roles ending in -admin or containing -critical-. This is demo-grade least privilege, and the Terraform says so.",
  },
  {
    title: "Everything is on the record",
    body: "Each proposal keeps its agent, node, parameters, reasoning, status, timestamps and outcome, and the audit log lists them all.",
  },
];

export default function Safety() {
  return (
    <section id="safety" className={styles.section}>
      <div className={`${styles.container} ${styles.split}`}>
        <div>
          <h2 className={styles.h2}>Agents can propose. Only a human can execute.</h2>
          <p className={styles.sectionLead}>
            Letting a language model near a production account is only reasonable if the dangerous step is not its to
            take. That is enforced in code and in IAM, not in a prompt.
          </p>
          <dl className={styles.guarantees}>
            {GUARANTEES.map((g) => (
              <div key={g.title} className={styles.guarantee}>
                <dt className={styles.h3}>{g.title}</dt>
                <dd className={styles.body}>{g.body}</dd>
              </div>
            ))}
          </dl>
        </div>

        <Reveal as="figure" delay={120} className={styles.codeFigure}>
          <figcaption className={styles.codeCaption}>backend/app/actions/proposals.py (abridged)</figcaption>
          <pre className={styles.codeBlock}>
            <code>{`def propose_action(action_store, agent_id,
                   node_id, tool_name, params):
    # Records intent. Never calls boto3.
    action = action_store.create(
        agent_id=agent_id, node_id=node_id,
        tool_name=tool_name, params=params,
    )
    return {
        "pending_action": action,
        "message": f"Proposed '{tool_name}' "
                   "for human approval",
    }`}</code>
          </pre>
          <figcaption className={styles.codeCaption}>What the audit log stores for one proposal</figcaption>
          <pre className={styles.codeBlock}>
            <code>{`{
  "agent_id": "security",
  "node_id": "lambda:order-processor",
  "tool_name": "tighten_iam_policy",
  "params": { "role_name": "…", "policy_name": "…" },
  "proposed_reasoning": "Role grants wildcard…",
  "status": "pending",   // → approved | rejected
  "created_at": "…", "resolved_at": null,
  "result": null          // set after execution
}`}</code>
          </pre>
        </Reveal>
      </div>
    </section>
  );
}
