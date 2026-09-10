# Cloudsentry

An AI-native operations copilot for AWS. Cloudsentry watches your cloud
resources, understands what's actually happening (not just raw metrics), and
answers operational questions in plain language — then, with permission, acts.

## Origin

Cloudsentry supersedes an earlier project, "AWS Cloud Engineer's Toolbox"
(a Next.js demo site showcasing IAM policies, Lambda, IaC snippets, and a
live echo function behind API Gateway). That project was built to *show*
cloud skills through static/interactive demos. Cloudsentry keeps the same
real AWS plumbing (Lambda, API Gateway, CloudWatch, IAM) but turns it from a
demo into a working product: an agent that reasons over live account state
instead of illustrating concepts.

## What it does

- **Ask questions about your AWS account in plain language** — "why did
  latency spike last night", "what's driving my EC2 cost this month", "any
  IAM roles with excess permissions".
- **Investigates, not just reports** — chains real AWS API calls (CloudWatch
  Logs Insights queries, Cost Explorer, IAM policy analysis, EC2/Lambda
  metrics) and reasons over the combined result.
- **Summarizes incidents** — turns a burst of CloudWatch log noise into a
  short human-readable incident summary with a likely root cause.
- **Recommends and, on approval, acts** — e.g. right-sizing an instance,
  tightening an over-permissive IAM policy — always behind an explicit
  confirmation step, never silent changes.

## Architecture (initial direction)

- **Agent core**: Claude (via the Anthropic API) as the reasoning loop, with
  a fixed toolbox of read-mostly AWS actions exposed as tool-use functions
  (CloudWatch Logs/Metrics, Cost Explorer, IAM, EC2, Lambda).
- **Tool layer**: thin wrappers around boto3 calls — this is where the
  original toolbox's individual demos (IAM policy analysis, Lambda
  invocation, log inspection) get reused as real tools instead of illustrative
  snippets.
- **Interface**: a chat-style frontend (reusing the existing Next.js
  toolbox UI where it makes sense) plus a CLI for scripted/CI use.
- **Guardrails**: IAM least-privilege for the agent's own execution role;
  read-only by default, mutating actions require explicit human confirmation.

## Status

Early scaffolding. Architecture and task breakdown to follow.
