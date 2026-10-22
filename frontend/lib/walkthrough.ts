// The five-step cycle Cloudsentry runs, shared by the live walkthrough rail
// (components/FlowRail) and the written explanation (components/landing/Flow).
// `backend` names the real code that performs the step.

export type StepId = "observe" | "investigate" | "conclude" | "propose" | "approve";

export interface FlowStep {
  id: StepId;
  title: string;
  /** One line, shown in the live rail. */
  short: string;
  /** The full explanation, shown in the written flow. */
  detail: string;
  backend: string;
}

export const FLOW_STEPS: FlowStep[] = [
  {
    id: "observe",
    title: "Observe",
    short: "A poller reads the account and streams only what changed.",
    detail:
      "Every 30 seconds a poller reads EC2, Lambda, DynamoDB, CloudWatch and Cost Explorer and rebuilds the account as a graph. Edges come from real signals: instances sharing a VPC, Lambda environment variables that name a table, IAM policies that grant access. The new graph is diffed against the last one, and only the differences are pushed to the browser.",
    backend: "GraphPoller → diff_graphs → WebSocket /graph/stream",
  },
  {
    id: "investigate",
    title: "Investigate",
    short: "An agent flies to the node that looks wrong and starts digging.",
    detail:
      "Each agent picks the node worth a look: Cost and Performance choose whatever is running more than 1.5× above its own rolling baseline, Security walks the Lambda functions in rotation. Its marker travels to that node, then a bounded Claude tool-use loop (at most five calls) queries real AWS data through a toolset scoped to that agent.",
    backend: "AgentRunner → investigate_node → read-only tools",
  },
  {
    id: "conclude",
    title: "Conclude",
    short: "It writes a plain-language finding and pins it to the node.",
    detail:
      "The loop ends with a two-to-three sentence finding in plain language, anchored to the node it is about. No dashboards to interpret and no chat transcript to scroll: the explanation sits on the thing it explains.",
    backend: "finding event → FindingBubble",
  },
  {
    id: "propose",
    title: "Propose",
    short: "If a fix applies, the exact change appears as a pending card.",
    detail:
      "When a fix applies, the agent calls an action tool. That tool never touches AWS. It records a pending action with the exact parameters and the agent's reasoning, and the UI shows it as a card attached to the node it concerns.",
    backend: "build_action_tool → ActionStore (SQLite, status = pending)",
  },
  {
    id: "approve",
    title: "Approve",
    short: "Nothing runs until a human clicks. Every decision is logged.",
    detail:
      "A person reviews the exact change and approves or rejects it. Only the approve endpoint executes anything, through a separate executor that calls boto3, and the outcome is written back to the audit log. Reject, and nothing happens.",
    backend: "POST /actions/{id}/approve → execute_action → audit log",
  },
];
