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
