# Cloudsentry Infrastructure

Terraform and deployment tooling for Cloudsentry. See `docs/spec.md` §4.8 for the source requirements this implements.

## Traffic Generator

`backend/scripts/traffic_generator.py` (built in Phase 2) is intentionally **not** containerized and **not** part of the ECS task definition in `infra/terraform/ecs/` — spec §4.8 requires it run "as a separate process, never inside the main API," since it exists to produce genuine demo traffic, not to serve requests.

Two ways to run it against a deployed backend:

1. **Run it locally** (the same way it's been run in every phase's manual verification), pointed at your AWS account:
   ```bash
   cd backend
   AWS_PROFILE=ops-agent AWS_DEFAULT_REGION=us-east-1 python scripts/traffic_generator.py <function-names> --interval 5
   ```
2. **Deferred future option:** package it as its own small scheduled ECS task or Lambda if unattended operation is ever needed. Spec §4.8 only suggests this as an option ("a local script or a tiny scheduled Lambda") — it is not built here (YAGNI): scheduling, retry behavior, and failure alerting for an unattended traffic generator are real design decisions better made when there's an actual need for unattended operation, not spent upfront.

## What Terraform manages

- `infra/terraform/iam/` — the `cloudsentry-execution-role` (task role): least-privilege read access for the AWS Tool Layer and agent swarm, plus narrowly-scoped write access for the three action tools. See that module's `main.tf` for the exact permission set and reasoning.
- `infra/terraform/ecs/` — the ECS Fargate cluster, task definition, service, CloudWatch log group, and the ECS task *execution* role (distinct from the task role above — see "Why ECS, not Lambda" below). Takes the IAM module's `execution_role_arn` output as an input variable (`cloudsentry_task_role_arn`); these are two separate Terraform working directories/state, not a combined root module, so chain them manually:
  ```bash
  cd infra/terraform/iam && terraform output execution_role_arn
  # pass that value as -var="cloudsentry_task_role_arn=..." when applying infra/terraform/ecs
  ```

## Why ECS, not Lambda

Spec §4.8 leaves the choice open ("Lambda or ECS — decided at the deployment phase based on cold-start/cost tradeoffs"). Cloudsentry's backend rules out Lambda: the FastAPI app's lifespan (`backend/app/main.py`) starts genuinely long-running background `asyncio` tasks — a graph poller on a 30s cadence and three agent investigation loops on a 60s cadence — that must keep running continuously, across and between HTTP/WebSocket requests, for the life of the process. Lambda's execution model is request-driven and ephemeral between invocations: a background loop started inside one invocation's lifespan does not survive to serve the next invocation, and Lambda offers no supported way to keep a loop like this alive between invocations. ECS Fargate — a persistent, always-on container — is the only fit among the spec's two listed options. Do not revisit this without first changing the backend's polling architecture (e.g., moving the poller/agents to their own scheduled, stateless invocations backed by a persisted graph store) — that would be a significant redesign, not a deployment-target swap.

## Manual, credentialed steps required to actually deploy (not run by any automated tooling)

These steps create real, billed AWS resources and are never run automatically — they require your own AWS credentials with apply-level permissions and your explicit review of the plan output:

1. **Build and push the backend image.** `docker build -t cloudsentry-backend backend/`, then push it to a container registry. This project does not create an ECR repository — that's its own decision (registry lifecycle policy, tagging strategy, cross-account access) left for whenever real deployment happens, not built speculatively here.
2. **`terraform init`** in `infra/terraform/iam/` and `infra/terraform/ecs/` with real backend configuration (a real Terraform state backend — S3 + DynamoDB locking, or Terraform Cloud — is not configured here; the default local backend is used for `validate`-only usage in this repo).
3. **`terraform plan`** in each directory, with real AWS credentials and the required variables supplied (`aws_region`, `container_image`, `cloudsentry_task_role_arn`, `vpc_id`, `subnet_ids`, etc.) — **review the plan output** before proceeding.
4. **`terraform apply`** in `infra/terraform/iam/` first, then `infra/terraform/ecs/` (which depends on the IAM module's output).
5. **Populate the Anthropic API key secret**: `aws secretsmanager put-secret-value --secret-id <the aws_secretsmanager_secret.anthropic_api_key ARN from the ecs module's output> --secret-string '<key>'` — the secret container is created by Terraform, but its value is deliberately never written into Terraform state or source control.
6. **Deploy the frontend** — see `frontend/README.md`'s Deployment section.

None of these six steps are performed by this plan's automated execution, under any circumstances.
