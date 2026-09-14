# Phase 6 — Deployment + Least-Privilege IAM Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Author, as reviewable Terraform, Cloudsentry's own least-privilege AWS execution role; containerize the backend; author (but never apply) the ECS Fargate deployment that would run it; and document the frontend's Vercel deployment and the Traffic Generator's operational model — without ever provisioning real, billed AWS/Vercel resources as part of this plan's automated execution.

**Architecture:** A dedicated `cloudsentry-execution-role` IAM role (Terraform, `infra/terraform/iam/`) is Cloudsentry's own AWS identity — separate from any admin/build-time profile — with read-only access to the AWS Tool Layer's data sources and narrowly-scoped write access for exactly the three action tools. The backend (`backend/Dockerfile`) is packaged as a single container and deployed as an always-on ECS Fargate service (`infra/terraform/ecs/`), not Lambda — Lambda's ephemeral, request-driven execution model cannot host the backend's genuinely long-running background `asyncio` tasks (the graph poller and three agent loops, all started once via FastAPI's lifespan and running continuously for the life of the process). The frontend deploys to Vercel (zero Terraform needed). The Traffic Generator stays a separate, uncontainerized process, run manually against a deployed backend.

**Tech Stack:** Terraform (AWS provider `~> 5.0`), Docker, no new application code.

**Spec:** `docs/spec.md` (section 4.8 Deployment / IAM, section 7 Phase 6)

## Global Constraints

- The execution role's read permissions cover exactly the AWS Tool Layer's calls (Phases 1 and 3): CloudWatch, Cost Explorer, EC2 describe, Lambda list/invoke, DynamoDB describe, IAM read — no broader.
- The execution role's write permissions cover exactly the three action tools (Phase 4) — `ec2:StopInstances`, `ec2:ModifyInstanceAttribute` (tag-conditioned), `iam:PutRolePolicy` (scoped away from obviously-critical role names) — no broader.
- The role must be defined as Terraform (IaC), not created by hand in the console (spec §4.8: "so the policy is itself reviewable, versioned code").
- The Traffic Generator is never containerized into the API's task definition (spec §4.8: "never inside the main API").
- **No `terraform apply`, no `docker push` to any registry, and no `vercel deploy` are ever run as part of this plan's automated execution** — every such step creates real, billed, and/or publicly-reachable resources in the user's AWS/Vercel accounts and requires the user's own credentials and explicit go-ahead. This is stronger than prior phases' "run this against a live backend with the user watching" deferrals — this is "provisions real infrastructure that costs money and persists after the session ends."

## Design Notes (Phase 6 scoping decisions)

- **Why ECS, not Lambda** (also written into `infra/README.md` for future readers): the backend's FastAPI lifespan starts background `asyncio` tasks — a 30s graph poller and three 60s agent loops — that must keep running continuously, across and between requests. Lambda's execution model is request-driven and ephemeral between invocations; a background loop started in one invocation's lifespan does not survive to serve the next. ECS Fargate (a persistent, always-on container) is the only fit among the spec's two listed options. This is a real architectural constraint, not a preference.
- **No Application Load Balancer / public networking in this scope.** The ECS service runs without a reachable public endpoint. Adding an ALB, public subnet routing, and TLS termination is real, separate infrastructure work — deferred, not built speculatively, before treating this as a real public deployment.
- **No ECR repository is created.** Building an image (Task 2) and deciding where to push it (registry choice, lifecycle policy, tagging strategy, cross-account access) are separable concerns; the latter is a genuine human decision left for actual deployment time.
- **The `iam:PutRolePolicy` "non-critical roles" restriction uses `not_resources` ARN-pattern exclusion**, not a fabricated IAM condition key — IAM has no built-in condition variable for "the target role's name," so the only technically correct way to express this exclusion is directly on the `Resource`/`NotResource` ARN pattern. This is documented in the Terraform as approximate — real "criticality" isn't fully expressible in IAM policy language alone.
- **`infra/terraform/iam/` and `infra/terraform/ecs/` are two independent Terraform working directories** (separate state, separate `init`/`validate`/`apply` cycles), not a combined root module — `ecs/` takes `iam/`'s role ARN as a plain input variable, chained manually. This keeps each directory's blast radius small and matches how a human would actually apply them (IAM role first, then the service that assumes it).

---

## File Structure

- `infra/terraform/iam/versions.tf`, `variables.tf`, `main.tf`, `outputs.tf` — the Cloudsentry execution (task) role.
- `backend/Dockerfile`, `backend/.dockerignore` — the backend container image.
- `infra/terraform/ecs/versions.tf`, `variables.tf`, `main.tf`, `outputs.tf` — the ECS Fargate deployment.
- `frontend/vercel.json`, `frontend/README.md` — frontend deployment config/docs.
- `infra/README.md` — architecture summary, Traffic Generator operational notes, manual deployment steps.

---

## Task 1: Cloudsentry execution (task) IAM role — Terraform

**Files:**
- Create: `infra/terraform/iam/versions.tf`
- Create: `infra/terraform/iam/variables.tf`
- Create: `infra/terraform/iam/main.tf`
- Create: `infra/terraform/iam/outputs.tf`

**Interfaces:**
- Produces: an `aws_iam_role.cloudsentry_execution_role` resource; outputs `execution_role_arn`, `execution_role_name` — consumed by Task 3 (`ecs/`)'s `cloudsentry_task_role_arn` variable.

- [ ] **Step 1: Write `infra/terraform/iam/versions.tf`**

```hcl
terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}
```

- [ ] **Step 2: Write `infra/terraform/iam/variables.tf`**

```hcl
variable "aws_region" {
  description = "AWS region Cloudsentry operates in."
  type        = string
}

variable "environment_name" {
  description = "Logical environment name, used in resource naming."
  type        = string
  default     = "dev"
}
```

- [ ] **Step 3: Write `infra/terraform/iam/main.tf`**

```hcl
data "aws_iam_policy_document" "assume_role" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "cloudsentry_execution_role" {
  name               = "cloudsentry-execution-role-${var.environment_name}"
  assume_role_policy = data.aws_iam_policy_document.assume_role.json
}

# Read-only permissions for the AWS Tool Layer (Phase 1) and the agent
# swarm's investigation loops (Phase 3). These are all describe/list/get
# calls with no natural per-resource scoping available in this account
# layout (e.g. cloudwatch:GetMetricStatistics has no resource-level ARN
# to scope to), so Resource "*" is the correct least-privilege shape for
# a read-only action here, not a shortcut.
data "aws_iam_policy_document" "read_only" {
  statement {
    sid    = "CloudsentryReadOnly"
    effect = "Allow"
    actions = [
      "cloudwatch:GetMetricStatistics",
      "cloudwatch:ListMetrics",
      "logs:StartQuery",
      "logs:GetQueryResults",
      "logs:StopQuery",
      "ce:GetCostAndUsage",
      "ec2:DescribeInstances",
      "lambda:ListFunctions",
      "lambda:InvokeFunction",
      "dynamodb:ListTables",
      "dynamodb:DescribeTable",
      "iam:ListAttachedRolePolicies",
      "iam:GetPolicy",
      "iam:GetPolicyVersion",
      "iam:ListRolePolicies",
      "iam:GetRolePolicy",
    ]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "read_only" {
  name   = "cloudsentry-read-only"
  role   = aws_iam_role.cloudsentry_execution_role.id
  policy = data.aws_iam_policy_document.read_only.json
}

# Narrowly-scoped write permissions for the three action tools (Phase 4).
# Real-world "restricted to non-critical roles" cannot be perfectly
# expressed in IAM policy language alone. IAM has no condition key for
# "the target role's own name", so the only technically correct way to
# express an exclusion is directly on the Resource/NotResource ARN
# pattern — this excludes role names containing "-admin" or
# "-critical-". This is what least-privilege looks like for a
# demo/learning project, not a production-grade guarantee; a production
# deployment would need a permissions boundary or an allowlist
# maintained outside Terraform.
data "aws_iam_policy_document" "scoped_write" {
  statement {
    sid       = "CloudsentryStopResizeTaggedInstances"
    effect    = "Allow"
    actions   = ["ec2:StopInstances", "ec2:ModifyInstanceAttribute"]
    resources = ["arn:aws:ec2:*:*:instance/*"]

    condition {
      test     = "StringEquals"
      variable = "aws:ResourceTag/CloudsentryManaged"
      values   = ["true"]
    }
  }

  statement {
    sid     = "CloudsentryTightenNonCriticalRolePolicies"
    effect  = "Allow"
    actions = ["iam:PutRolePolicy"]
    not_resources = [
      "arn:aws:iam::*:role/*-admin",
      "arn:aws:iam::*:role/*-critical-*",
    ]
  }
}

resource "aws_iam_role_policy" "scoped_write" {
  name   = "cloudsentry-scoped-write"
  role   = aws_iam_role.cloudsentry_execution_role.id
  policy = data.aws_iam_policy_document.scoped_write.json
}
```

- [ ] **Step 4: Write `infra/terraform/iam/outputs.tf`**

```hcl
output "execution_role_arn" {
  description = "ARN of the Cloudsentry execution (task) role."
  value       = aws_iam_role.cloudsentry_execution_role.arn
}

output "execution_role_name" {
  description = "Name of the Cloudsentry execution (task) role."
  value       = aws_iam_role.cloudsentry_execution_role.name
}
```

- [ ] **Step 5: Validate**

Run (from `infra/terraform/iam/`):

```bash
terraform fmt -check
terraform init -backend=false
terraform validate
```

Expected: `terraform fmt -check` prints nothing (files already formatted); `terraform init -backend=false` succeeds and downloads the `hashicorp/aws` provider; `terraform validate` prints `Success! The configuration is valid.`

If `terraform fmt -check` reports a file, run `terraform fmt` to fix formatting and re-check before proceeding.

- [ ] **Step 6: Commit**

```bash
git add infra/terraform/iam/
git commit -m "feat: add Cloudsentry execution role Terraform (least-privilege IAM)"
```

---

## Task 2: Backend Dockerfile

**Files:**
- Create: `backend/Dockerfile`
- Create: `backend/.dockerignore`

**Interfaces:**
- Produces: a `cloudsentry-backend:local` image runnable via `docker run`, consumed by Task 3's `container_image` variable (once pushed to a real registry — not part of this plan).

- [ ] **Step 1: Write `backend/.dockerignore`**

```
.venv/
__pycache__/
*.pyc
tests/
*.db
.env*
```

- [ ] **Step 2: Write `backend/Dockerfile`**

```dockerfile
FROM python:3.11-slim

WORKDIR /app

COPY pyproject.toml ./
COPY app ./app

RUN pip install --no-cache-dir .

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

- [ ] **Step 3: Build the image**

Run (from the repo root): `docker build -t cloudsentry-backend:local backend/`
Expected: The build completes successfully (exit code 0), ending with `Successfully tagged cloudsentry-backend:local` (or the equivalent BuildKit "naming to docker.io/library/cloudsentry-backend:local" line).

- [ ] **Step 4: Smoke-test the container locally**

This is safe to actually run — no AWS credentials are passed in, so the app's boto3/Anthropic clients are never exercised beyond import time, and `/health` doesn't touch them.

```bash
docker run --rm -d --name cloudsentry-backend-smoketest -p 8000:8000 cloudsentry-backend:local
sleep 2
curl -s http://localhost:8000/health
docker stop cloudsentry-backend-smoketest
```

Expected: `curl` prints `{"status":"ok"}`.

- [ ] **Step 5: Commit**

```bash
git add backend/Dockerfile backend/.dockerignore
git commit -m "feat: add backend Dockerfile"
```

---

## Task 3: ECS Fargate deployment — Terraform

**Files:**
- Create: `infra/terraform/ecs/versions.tf`
- Create: `infra/terraform/ecs/variables.tf`
- Create: `infra/terraform/ecs/main.tf`
- Create: `infra/terraform/ecs/outputs.tf`

**Interfaces:**
- Consumes: `execution_role_arn` (Task 1, passed in as the `cloudsentry_task_role_arn` variable); the image built in Task 2 (passed in as the `container_image` variable, once pushed to a registry — not part of this plan).
- Produces: an ECS cluster, task definition, service, log group, and a Secrets Manager secret container for the Anthropic API key.

- [ ] **Step 1: Write `infra/terraform/ecs/versions.tf`**

```hcl
terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}
```

- [ ] **Step 2: Write `infra/terraform/ecs/variables.tf`**

```hcl
variable "aws_region" {
  description = "AWS region to deploy into."
  type        = string
}

variable "environment_name" {
  description = "Logical environment name, used in resource naming."
  type        = string
  default     = "dev"
}

variable "container_image" {
  description = "Full image URI (e.g. an ECR repository URI:tag) for the backend container, built via backend/Dockerfile. Pushing it to a registry is a manual step this Terraform does not perform."
  type        = string
}

variable "cloudsentry_task_role_arn" {
  description = "ARN of the Cloudsentry execution (task) role, from infra/terraform/iam's execution_role_arn output."
  type        = string
}

variable "vpc_id" {
  description = "VPC to deploy the ECS service into. This Terraform does not create a VPC — supply an existing one (e.g. the account's default VPC)."
  type        = string
}

variable "subnet_ids" {
  description = "Subnet IDs for the ECS service's network configuration (private subnets recommended, since assign_public_ip is false)."
  type        = list(string)
}
```

- [ ] **Step 3: Write `infra/terraform/ecs/main.tf`**

```hcl
data "aws_iam_policy_document" "ecs_task_execution_assume_role" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

# Standard ECS "execution role": what the ECS agent itself assumes to pull
# the container image and write logs on the task's behalf. This is
# distinct from the Cloudsentry "task role" (infra/terraform/iam) — the
# task role is what the RUNNING APPLICATION CODE assumes to call AWS
# APIs (CloudWatch, Cost Explorer, etc.); the execution role never
# touches application-level AWS calls. Every ECS Fargate task needs
# both.
resource "aws_iam_role" "ecs_task_execution_role" {
  name               = "cloudsentry-ecs-execution-role-${var.environment_name}"
  assume_role_policy = data.aws_iam_policy_document.ecs_task_execution_assume_role.json
}

resource "aws_iam_role_policy_attachment" "ecs_task_execution_managed" {
  role       = aws_iam_role.ecs_task_execution_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_secretsmanager_secret" "anthropic_api_key" {
  name        = "cloudsentry/${var.environment_name}/anthropic-api-key"
  description = "Anthropic API key for Cloudsentry's agent swarm. Terraform only creates this secret container — populate its value manually (e.g. `aws secretsmanager put-secret-value`), never via Terraform state or source control."
}

resource "aws_iam_role_policy" "ecs_task_execution_read_secret" {
  name = "cloudsentry-read-anthropic-secret"
  role = aws_iam_role.ecs_task_execution_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["secretsmanager:GetSecretValue"]
        Resource = aws_secretsmanager_secret.anthropic_api_key.arn
      }
    ]
  })
}

resource "aws_cloudwatch_log_group" "backend" {
  name              = "/cloudsentry/${var.environment_name}/backend"
  retention_in_days = 14
}

resource "aws_ecs_cluster" "cloudsentry" {
  name = "cloudsentry-${var.environment_name}"
}

resource "aws_ecs_task_definition" "backend" {
  family                   = "cloudsentry-backend-${var.environment_name}"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = "512"
  memory                   = "1024"
  execution_role_arn       = aws_iam_role.ecs_task_execution_role.arn
  task_role_arn            = var.cloudsentry_task_role_arn

  container_definitions = jsonencode([
    {
      name      = "backend"
      image     = var.container_image
      essential = true
      portMappings = [
        { containerPort = 8000, protocol = "tcp" }
      ]
      environment = [
        { name = "AWS_DEFAULT_REGION", value = var.aws_region }
      ]
      secrets = [
        {
          name      = "ANTHROPIC_API_KEY"
          valueFrom = aws_secretsmanager_secret.anthropic_api_key.arn
        }
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.backend.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "backend"
        }
      }
    }
  ])
}

resource "aws_security_group" "backend" {
  name        = "cloudsentry-backend-${var.environment_name}"
  description = "Cloudsentry backend ECS task security group"
  vpc_id      = var.vpc_id

  egress {
    description = "Allow all outbound (AWS APIs, Anthropic API)"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# No Application Load Balancer or public subnet routing in this scope —
# deferred item: add an ALB + public networking before treating this as
# a real public deployment. The service runs without a reachable public
# endpoint; reaching it requires VPC-internal access (e.g. a bastion or
# VPN), a manual operational step outside this Terraform.
resource "aws_ecs_service" "backend" {
  name            = "cloudsentry-backend-${var.environment_name}"
  cluster         = aws_ecs_cluster.cloudsentry.id
  task_definition = aws_ecs_task_definition.backend.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = var.subnet_ids
    security_groups  = [aws_security_group.backend.id]
    assign_public_ip = false
  }
}
```

- [ ] **Step 4: Write `infra/terraform/ecs/outputs.tf`**

```hcl
output "ecs_cluster_name" {
  value = aws_ecs_cluster.cloudsentry.name
}

output "ecs_service_name" {
  value = aws_ecs_service.backend.name
}

output "backend_log_group" {
  value = aws_cloudwatch_log_group.backend.name
}

output "anthropic_api_key_secret_arn" {
  description = "ARN of the Secrets Manager secret — populate its value manually before the service can start successfully."
  value       = aws_secretsmanager_secret.anthropic_api_key.arn
}
```

- [ ] **Step 5: Validate**

Run (from `infra/terraform/ecs/`):

```bash
terraform fmt -check
terraform init -backend=false
terraform validate
```

Expected: same as Task 1 — `fmt -check` prints nothing, `init` succeeds, `validate` prints `Success! The configuration is valid.` No `terraform plan`/`apply` here — those require a real AWS provider connection and this task must not reach out to real AWS services unattended.

- [ ] **Step 6: Commit**

```bash
git add infra/terraform/ecs/
git commit -m "feat: add ECS Fargate deployment Terraform for the backend"
```

---

## Task 4: Frontend deployment config

**Files:**
- Create: `frontend/vercel.json`
- Create: `frontend/README.md`

**Interfaces:** none (documentation + config only).

- [ ] **Step 1: Write `frontend/vercel.json`**

```json
{
  "buildCommand": "npm run build",
  "devCommand": "npm run dev",
  "installCommand": "npm install"
}
```

- [ ] **Step 2: Write `frontend/README.md`**

```markdown
# Cloudsentry Frontend

Next.js (App Router) + TypeScript UI for Cloudsentry's live infrastructure graph. See `docs/spec.md` and `docs/superpowers/plans/phase-5-web-ui.md` for design details.

## Local development

```bash
cp .env.local.example .env.local
npm install
npm run dev
```

Requires the backend (`backend/`) running locally and reachable at the URL in `NEXT_PUBLIC_API_BASE_URL` (defaults to `http://localhost:8000`).

## Testing

```bash
npm test
```

## Deployment

This app deploys to [Vercel](https://vercel.com) (per `docs/spec.md` §4.8's "S3 + CloudFront or Vercel" choice — Vercel is the zero-config option for a Next.js app and needs no additional Terraform).

1. Connect this repository to a Vercel project (via the Vercel dashboard, or the `vercel` CLI — requires a Vercel account this project cannot create or authenticate for you).
2. Set `NEXT_PUBLIC_API_BASE_URL` as a Vercel project environment variable, pointing at the deployed backend's URL.
3. **Dependency note:** the backend's ECS service (`infra/terraform/ecs/`) currently has no public endpoint — see that module's "no ALB" deferred item in `infra/README.md`. Add a load balancer and public routing to the backend before this frontend deployment can actually reach a live backend from outside AWS's network.
4. Deploy: push to the connected branch, or run `vercel deploy` locally.

`vercel.json` in this directory just pins the build/dev/install commands Vercel would otherwise infer.
```

- [ ] **Step 3: Validate**

Run: `python3 -c "import json; json.load(open('frontend/vercel.json'))" && echo "vercel.json is valid JSON"`
Expected: `vercel.json is valid JSON`

Read `frontend/README.md` back to confirm it renders as intended (headings, code fences) — no automated check needed beyond visual correctness, since there's no real deploy to test here.

- [ ] **Step 4: Commit**

```bash
git add frontend/vercel.json frontend/README.md
git commit -m "docs: add frontend Vercel deployment config and instructions"
```

---

## Task 5: Traffic Generator operational notes

**Files:**
- Create: `infra/README.md`

**Interfaces:** none (documentation only). Extended by Task 6.

- [ ] **Step 1: Write `infra/README.md`**

```markdown
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
```

- [ ] **Step 2: Validate**

Read the file back to confirm it renders correctly — no automated check, documentation only.

- [ ] **Step 3: Commit**

```bash
git add infra/README.md
git commit -m "docs: add infra README with Traffic Generator operational notes"
```

---

## Task 6: Root infra README — architecture summary and manual deployment steps

**Files:**
- Modify: `infra/README.md`

**Interfaces:** none (documentation only).

- [ ] **Step 1: Append to `infra/README.md`**

```markdown

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
```

- [ ] **Step 2: Validate**

Read the file back to confirm the full document (Task 5 + Task 6 content) renders correctly.

- [ ] **Step 3: Commit**

```bash
git add infra/README.md
git commit -m "docs: add architecture summary and manual deployment steps to infra README"
```

---

## Task 7: Full validation pass

**Files:** none created; this task verifies every artifact from Tasks 1–4.

- [ ] **Step 1: Validate the IAM Terraform**

Run (from `infra/terraform/iam/`): `terraform fmt -check && terraform init -backend=false && terraform validate`
Expected: `Success! The configuration is valid.`

- [ ] **Step 2: Validate the ECS Terraform**

Run (from `infra/terraform/ecs/`): `terraform fmt -check && terraform init -backend=false && terraform validate`
Expected: `Success! The configuration is valid.`

- [ ] **Step 3: Rebuild and smoke-test the backend container**

Run (from the repo root):

```bash
docker build -t cloudsentry-backend:local backend/
docker run --rm -d --name cloudsentry-backend-smoketest -p 8000:8000 cloudsentry-backend:local
sleep 2
curl -s http://localhost:8000/health
docker stop cloudsentry-backend-smoketest
```

Expected: `{"status":"ok"}`

- [ ] **Step 4: Confirm `vercel.json` is valid JSON**

Run: `python3 -c "import json; json.load(open('frontend/vercel.json'))" && echo "vercel.json is valid JSON"`
Expected: `vercel.json is valid JSON`

- [ ] **Step 5: Report and stop**

Report Steps 1–4's results. Explicitly state: `terraform apply` (in either directory), any real `docker push` to a registry, and any real `vercel deploy` are **not** run as part of this task or any prior task in this plan — provisioning real infrastructure, pushing a real image, and deploying a real frontend all require the user's own credentials, their review of what would be created, and their explicit go-ahead. Nothing in this plan performs them automatically, regardless of how the plan is executed.

- [ ] **Step 6: Commit** (only if Steps 1–4 required any fixes)

```bash
git add -A
git commit -m "test: verify Phase 6 deployment artifacts validate and build cleanly"
```

---

## Self-Review Notes

- **Spec coverage:** The dedicated least-privilege IAM execution role as reviewable Terraform (spec §4.8, "This role is defined as IaC... so the policy is itself reviewable, versioned code") is covered by Task 1. The container deployment decision, made explicit with reasoning (spec §4.8, "Lambda or ECS — decided at the deployment phase") is covered by Tasks 2–3 and the Design Notes' "Why ECS, not Lambda" section. Frontend deployment to Vercel (spec §4.8, "S3 + CloudFront or Vercel") is covered by Task 4. The Traffic Generator running "as a separate process" (spec §4.8) is covered by Task 5.
- **Out of scope confirmed absent:** no `terraform apply`, no image push, no real Vercel deploy, no ALB/public networking, no ECR repository — all explicitly named as deferred/manual in the Design Notes, Task 6's README content, and Task 7's final report, never executed by this plan.
- **Type/reference consistency:** `infra/terraform/ecs/variables.tf`'s `cloudsentry_task_role_arn` variable is documented as sourced from `infra/terraform/iam/outputs.tf`'s exact `execution_role_arn` output name (Task 1 → Task 3). `infra/terraform/ecs/main.tf`'s `container_image` variable matches the image tag built in Task 2 (`cloudsentry-backend:local` locally; a registry URI once pushed, per Task 6's manual-steps list). `frontend/README.md` (Task 4) references `infra/README.md`'s "no ALB" deferred item (Task 3's Design Note, restated in Task 6) by name, so the dependency between "frontend can reach a live backend" and "ECS needs a load balancer first" is stated consistently in both places.
</content>
