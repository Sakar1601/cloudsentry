# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Primary visitor of the public demo: hiring managers and recruiters evaluating the author's engineering portfolio. They skim, have about a minute, and must leave believing this is real, working, well-engineered software, not a mock dashboard. Secondary: engineers who want to see how the agent loop and approval gate work. (Confirmed with the author.)

## Product Purpose
Cloudsentry renders an AWS account (EC2, Lambda, DynamoDB) as a live force-directed graph. Three Claude tool-use agents (Cost, Performance, Security) continuously pick a node, call AWS APIs, annotate what they find, and propose a fix. No mutation happens until a human approves it, and every decision is audited. The static demo exists so a visitor can understand the product and try it with nothing installed. Success: a visitor understands what it is, how the flow works, and that it is real engineering.

## Positioning
Agents act visibly on a living map of the infrastructure (they move to the node they investigate, anchor findings and proposals to it), rather than answering in a chat transcript; every mutating action is gated behind explicit approval and logged.

## Operating Context
The demo runs entirely in the browser against a simulated AWS account (TypeScript port of backend/app/demo). The real product runs a FastAPI backend, boto3, the Anthropic API, SQLite audit store, deployable with Terraform to ECS Fargate. Live-mode proof exists: it was run against a real AWS account.

## Capabilities and Constraints
- Graph: nodes ec2/lambda/dynamodb, edges same_vpc / references / iam_access, size by 7-day cost, deltas streamed over WebSocket.
- Agents: Cost (can propose stop_ec2_instance), Performance (resize_ec2_instance), Security (tighten_iam_policy).
- Action tools only propose; approve endpoint executes; audit log lists all.
- Static export (Next.js output: export), hosted on GitHub Pages under /cloudsentry base path. No backend in the demo.
- Do not invent customers, benchmarks or testimonials.

## Brand Commitments
Name: Cloudsentry. Existing dark "night ops" identity: calm desaturated node colors (ec2 blue, lambda green, dynamodb amber) reserved vs vivid agent colors (cost amber, performance violet, security red). Repo: https://github.com/Sakar1601/cloudsentry. Author's name/bio not provided; do not invent.

## Evidence on Hand
Real, from the repo: 118 backend tests + 22 frontend tests, 3 agents, 3 gated action tools, 6 AWS services read (EC2, Lambda, DynamoDB, CloudWatch, Cost Explorer, IAM), Terraform modules iam + ecs, CI + Pages workflows, docs/spec.md. Screenshots in docs/images. No testimonials or users exist.

## Product Principles
- Show, don't tell: the live graph is the proof; copy explains what the visitor is watching.
- Nothing mutates without a human click; say so plainly.
- Only claim what the repo proves.
- Understandable in a minute, rewarding in ten.
