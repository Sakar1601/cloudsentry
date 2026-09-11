# Cloudsentry: Living Infrastructure — Product Spec

## 1. What this is

Cloudsentry renders your real AWS account as a live, animated graph — nodes
for resources (EC2 instances, Lambda functions, DynamoDB tables, ...), edges
for their relationships (same VPC, IAM trust, invoke targets, env-var
references), color and pulse for cost and traffic. Instead of a chat window,
you watch a swarm of three specialized agents — Cost, Performance, Security —
continuously and autonomously investigate the graph: each visibly moves to
the node it's examining, calls real AWS APIs, annotates the node with what it
found, and — where a fix applies — proposes the exact action, anchored to
that node, for you to approve or reject.

It supersedes an earlier project, "AWS Cloud Engineer's Toolbox" (a Next.js
demo site with static/illustrative examples of IAM policies, IaC snippets,
and one live Lambda-behind-API-Gateway echo function), and pivots an earlier
draft of this project (a plain chat-based ops copilot) into something more
visually distinctive: the same real AWS plumbing and approval-gated action
model, but investigated and presented as a living system instead of a chat
transcript.

## 2. Goals

- Demonstrate real, working integration of multiple autonomous LLM agents
  with live AWS infrastructure — not a mocked dashboard, not a single
  request/response chatbot.
- Make the account's state and the agents' reasoning *visible*: a live graph
  the agents visibly act on, not a wall of text.
- Keep the account genuinely alive for the demo without faking data: a
  traffic generator that produces real invocations against real resources,
  so every metric, log, and cost datapoint the agents react to is real.
- Let the agent swarm take corrective action, but never silently — every
  mutating action is proposed with its exact parameters, anchored to the
  node it concerns, and requires explicit human approval before execution;
  every approved action is logged.
- Present as a polished, demoable product: a real API and real frontend, not
  a CLI demo or a static page.

## 3. Non-goals (out of scope for this spec)

- Multi-account / multi-tenant support. Cloudsentry targets a single AWS
  account (the one it's deployed against).
- Auto-remediation without human approval. No action executes without an
  explicit approve click.
- Full AWS service coverage. v1 covers compute (EC2, Lambda), data
  (DynamoDB — needed for the graph's edges and the traffic story), cost
  (Cost Explorer), observability (CloudWatch Logs + Metrics), and identity
  (IAM read/analysis).
- User account management / multi-user auth. v1 assumes a single
  authenticated operator (you), gated by a shared secret or basic auth, not
  a full identity provider.
- Real relationship discovery beyond simple heuristics. Edges come from
  static/config signals (same VPC, IAM trust, env-var references to other
  resources, known invoke targets) — no distributed tracing or AWS X-Ray
  integration in v1, even though that's a natural v2.
- Simulating or predicting failures. The graph reflects real, current
  account state; it does not forecast future incidents.

## 4. Architecture

Six subsystems, each independently testable:

```
┌──────────────────┐  WS/HTTP  ┌───────────────────┐  reads  ┌─────────────────────┐
│   Web UI          │◄─────────►│   Graph API        │◄───────►│   Graph Builder      │
│  (Next.js, live    │           │  (FastAPI)         │  polls  │  (polls AWS, builds  │
│   force-directed   │           │                    │────────►│   in-memory graph)   │
│   graph)           │           └─────────┬──────────┘         └──────────┬──────────┘
└──────────────────┘                     │                                │
                                           │ tool calls                    │ describe_*/
                          ┌────────────────▼─────────────────┐            │ CE/CW calls
                          │   Agent Swarm                     │            │
                          │  Cost | Performance | Security     │────────────┘
                          │  (each: Claude tool-use loop over  │
                          │   the AWS Tool Layer)               │
                          └────────────────┬─────────────────┘
                                           │ action tool calls
                                           ▼
                          ┌──────────────────────────────────┐        ┌─────────────────┐
                          │ Action/Approval subsystem +       │───────►│   Live AWS       │
                          │ audit log (anchored to graph      │        │  account          │
                          │ nodes)                             │        │ (read + gated    │
                          └──────────────────────────────────┘        │  write)          │
                                                                        └─────────────────┘
                          ┌──────────────────────────────────┐
                          │  Traffic Generator (standalone     │──── real invocations ────► Live AWS
                          │  script, invokes your own          │
                          │  Lambdas/endpoints on a loop)       │
                          └──────────────────────────────────┘
```

### 4.1 AWS Tool Layer

Thin, individually-testable Python functions wrapping boto3 calls, unchanged
in kind from the original design. Two categories:

**Read tools** (always allowed, no approval needed):
- `get_cloudwatch_logs(log_group, query, start_time, end_time)` — runs a
  CloudWatch Logs Insights query, returns matched log records.
- `get_cloudwatch_metric(namespace, metric_name, dimensions, start_time,
  end_time, stat)` — returns a metric datapoint series.
- `get_cost_and_usage(start_date, end_date, granularity, group_by)` —
  wraps Cost Explorer `GetCostAndUsage`.
- `list_ec2_instances(filters)` — describes instances with state, type,
  launch time, tags.
- `list_lambda_functions()` — lists functions with runtime, memory,
  timeout config.
- `list_dynamodb_tables()` — lists tables with capacity mode, item count,
  size.
- `get_iam_policy_for_role(role_name)` — returns the role's attached and
  inline policy documents for analysis.

**Action tools** (propose only; execution gated — see 4.4):
- `stop_ec2_instance(instance_id)`
- `resize_ec2_instance(instance_id, new_instance_type)`
- `tighten_iam_policy(role_name, policy_name, new_policy_document)`

Action tools never call AWS directly when invoked by an agent. Invoking one
creates a **pending action** record; a separate, explicit "execute approved
action" call — issued only after human approval — does the real AWS
mutation.

### 4.2 Graph Builder

- Polls `describe_instances`, `list_functions`, `list_tables`,
  `GetCostAndUsage`, and CloudWatch metrics on a fixed interval (default
  30s).
- Maintains an in-memory graph: `nodes = {node_id: {resource_type, name,
  state, cost_7d, last_metric_snapshot, tags}}`, `edges = [{source,
  target, relation}]`.
- Edges are derived from static signals only: same-VPC membership (EC2),
  IAM role trust relationships, Lambda environment variables that
  reference a table/queue ARN, and known invoke targets (e.g. Lambda
  triggered by API Gateway).
- On each poll, diffs the new snapshot against the last one and emits
  `graph_delta` events (`node_added`, `node_updated`, `node_removed`,
  `edge_added`, `edge_removed`) — these are the only messages pushed to
  connected clients; clients never re-fetch the full graph except on
  first connect.
- Node identity is stable across polls (AWS resource ARN/ID), so an
  agent's `agent_move` events can reference a node id that persists even
  as its `cost_7d`/metrics update underneath.

### 4.3 Agent Swarm

Three specialized agents, each its own Claude tool-use loop running on a
fixed cadence (default: check every 60s), each scoped to a subset of the
AWS Tool Layer:

- **Cost agent** — tools: `get_cost_and_usage`, `list_ec2_instances`,
  `list_lambda_functions`. Compares current-period cost per node/service
  against the trailing baseline; flags nodes whose cost trend crosses a
  simple threshold (e.g. >50% above the 7-day rolling average).
- **Performance agent** — tools: `get_cloudwatch_metric`,
  `get_cloudwatch_logs`, `list_lambda_functions`, `list_ec2_instances`.
  Compares recent latency/error-rate/duration metrics per node against
  their own trailing baseline; flags nodes crossing threshold.
- **Security agent** — tools: `get_iam_policy_for_role`,
  `list_ec2_instances`, `list_lambda_functions`. Flags roles whose
  attached/inline policies grant broad actions (`*`, wildcard resources)
  relative to what the resource's actual usage suggests it needs.

Each agent's loop, per cycle:
1. Scans its owned metric/signal across all current graph nodes to pick
   at most one node worth investigating (or none, if nothing crosses
   threshold).
2. Emits `agent_move {agent_id, target_node_id}` before doing anything
   else, so the UI can animate the agent traveling to the node.
3. Runs its Claude tool-use loop (same pattern as the original spec:
   send messages + tool defs → tool_use → execute via the AWS Tool Layer
   → tool_result → repeat) scoped to that node, producing a plain-language
   finding.
4. Emits `finding {agent_id, node_id, text}`.
5. If the finding maps to one of the three action tools, the agent calls
   it — this creates a `PendingAction` (see 4.4) and emits
   `action_proposed {agent_id, node_id, action_id}` instead of executing
   anything.

Agents run independently and concurrently; two agents may be mid-investigation
on different (or the same) node at once — the UI must be able to render
multiple agent icons and multiple finding bubbles per node.

### 4.4 Action / Approval Subsystem

Unchanged in mechanics from the original design, with actions anchored to
graph nodes for display:

- Every action tool call from any agent is persisted as a `PendingAction`:
  `{id, node_id, agent_id, tool_name, params, proposed_reasoning, status,
  created_at}` with `status` starting as `pending`.
- The API exposes `POST /actions/{id}/approve` and `POST
  /actions/{id}/reject`. Only `approve` triggers the real boto3 mutating
  call; the result (success/error) and a timestamp are recorded on the
  same record, and an `action_resolved` event is emitted.
- All pending and resolved actions are queryable via `GET /actions`,
  giving a full audit trail: what was proposed, by which agent, anchored
  to which node, who approved it, and what happened.
- Storage: SQLite for v1 (single-account, single-operator scope makes this
  sufficient; revisit only if multi-instance deployment is needed later).

### 4.5 Graph API (FastAPI)

- `GET /graph` — full current graph snapshot (nodes + edges), used on
  first client connect.
- `WS /graph/stream` — WebSocket channel emitting `graph_delta`,
  `agent_move`, `finding`, `action_proposed`, and `action_resolved`
  events as they occur.
- `POST /actions/{id}/approve`, `POST /actions/{id}/reject`, `GET
  /actions` — same as 4.4.
- Orchestrates the Graph Builder (4.2) and the three agent loops (4.3) as
  background tasks within the same process for v1.

### 4.6 Traffic Generator

- A standalone script (not part of the deployed API) that runs a loop
  invoking your own real Lambda function(s) and/or hitting a real HTTP
  endpoint on a fixed interval, so CloudWatch metrics/logs and Cost
  Explorer data reflect genuine, if modest, activity rather than a
  perfectly flat idle account.
- Configurable target list and interval; no synthetic/fabricated data is
  ever written directly to CloudWatch or any other AWS service — every
  datapoint the agents see is the real byproduct of a real invocation.

### 4.7 Web UI (Next.js)

- A live force-directed graph (canvas-rendered) as the primary view: nodes
  sized/colored by resource type and cost, edges drawn per the Graph
  Builder's relations, animated pulses along edges when a node's traffic
  changes.
- Agent icons (three, one per specialization) that animate moving to a
  target node on `agent_move`, with a finding bubble appearing on
  `finding`.
- Action cards anchored near their node on `action_proposed`, with
  Approve/Reject buttons wired to the approval endpoints; the card
  resolves (success/error state) on `action_resolved`.
- An "Audit Log" page listing all past actions and their outcomes (reads
  `GET /actions`).
- Polished, production-feel UI: loading/empty states for a freshly
  connecting graph, and a calm-but-legible visual style even as multiple
  agents animate concurrently.

### 4.8 Deployment / IAM

- Cloudsentry's own AWS execution identity is a **dedicated IAM role**,
  separate from the admin profile used to build it: read permissions for
  CloudWatch/Cost Explorer/EC2 describe/Lambda list/DynamoDB
  describe/IAM read, plus narrowly-scoped write permissions only for the
  three action tools above. This role is defined as IaC (Terraform) so
  the policy is itself reviewable, versioned code.
- API deployed as a container (Lambda or ECS — decided at the deployment
  phase); frontend deployed to S3 + CloudFront or Vercel; the Traffic
  Generator runs as a separate small process (local script or a tiny
  scheduled Lambda), never inside the main API.

## 5. How a request actually flows (example)

1. The Graph Builder's periodic poll adds a `my-service` Lambda node and
   a `my-service-events` DynamoDB table node, with an edge between them
   (Lambda's env vars reference the table ARN). The UI renders both.
2. The Traffic Generator invokes `my-service` every few seconds — real
   invocations, real CloudWatch data.
3. The Performance agent's next cycle finds `my-service`'s p99 duration up
   3x over its trailing baseline. It emits `agent_move` toward that node
   — the UI animates the agent traveling there.
4. It calls `get_cloudwatch_metric` and `get_cloudwatch_logs`, finds a
   burst of `ProvisionedThroughputExceededException` entries correlated
   with the duration spike, and emits a `finding`: "Duration p99 up 3x in
   the last 10 min — correlates with DynamoDB throttling on
   `my-service-events`." No action tool applies here (throttling isn't one
   of the three modeled actions), so it's presented as a finding only.
5. Separately, the Cost agent notices an idle `dev-box` EC2 instance's
   cost hasn't been justified by any recent activity, moves to that node,
   and calls `stop_ec2_instance(i-0123abc)` — creating a `PendingAction`
   and an `action_proposed` event.
6. The UI renders an action card off the `dev-box` node: "Stop instance
   i-0123abc (dev-box, idle 14h) — Approve / Reject."
7. You click Approve. The UI calls `POST /actions/{id}/approve`. The API
   performs the real `ec2:StopInstances` call, updates the record with
   the result, emits `action_resolved`, and the node visually updates to
   a stopped state.

## 6. Success criteria for v1

- Connecting to the Web UI shows a live graph of your real AWS account
  that visibly updates (new/changed nodes, pulses) within one poll
  interval of a real change.
- All three agents (Cost, Performance, Security) run continuously, and
  each produces at least one real finding grounded in real AWS API
  responses during a normal demo session — not a hallucinated summary.
- At least the three modeled action tools (stop/resize EC2, tighten IAM
  policy) work end-to-end: proposed → anchored to a node → approved →
  really executed → reflected in both the graph and the AWS console.
- The audit log shows every proposed action, which agent proposed it,
  which node it was anchored to, and its resolution.
- The Traffic Generator produces enough real activity that the graph and
  agents have something genuine to react to without any fabricated data.
- The UI is presentable as a live product demo without narrating "this
  part is mocked" — including the animation quality of agents moving and
  annotating the graph.

## 7. Phased execution

Each phase produces working, independently testable software:

- **Phase 1 — Static graph.** AWS Tool Layer (read tools, including the
  new `list_dynamodb_tables`), Graph Builder producing one full graph
  snapshot via `GET /graph`, tested via curl. No WebSocket, no agents, no
  traffic generator yet. Proves real AWS resources render as a correct
  graph structure.
- **Phase 2 — Live graph.** `WS /graph/stream` emitting `graph_delta`
  events, plus the Traffic Generator script. Proves the graph visibly
  animates from genuinely self-generated activity.
- **Phase 3 — Agent swarm (read-only).** Cost/Performance/Security
  investigate-loops emitting `agent_move` and `finding` events anchored
  to nodes. No actions yet — narration only.
- **Phase 4 — Action/approval, anchored to the graph.** `PendingAction`
  model, the three action tools, approve/reject endpoints, SQLite audit
  log, `action_proposed`/`action_resolved` events.
- **Phase 5 — Web UI.** Next.js app consuming Phases 1–4's API: live
  graph rendering, animated agents, finding bubbles, action cards, audit
  log page.
- **Phase 6 — Deployment + least-privilege IAM.** Terraform for
  Cloudsentry's own execution role, containerized API deployment,
  frontend deployment, Traffic Generator run as a separate process.

Each phase gets its own implementation plan under
`docs/superpowers/plans/`. The existing `docs/superpowers/plans/
phase-1-agent-core.md` describes the earlier chat-based design and is
superseded by this spec; a new Phase 1 plan for the static graph should
replace it before implementation resumes.
</content>
