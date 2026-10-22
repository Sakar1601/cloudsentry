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
#
# Both write paths are ALLOWLISTS keyed on a tag you set yourself: the service
# can only touch resources tagged CloudsentryManaged=true. Tag only what you
# are happy for an approved action to modify.
#
# iam:PutRolePolicy is the dangerous one: rewriting a role's inline policy can
# grant anything that role could be made to do. Two guards apply:
#   1. It is allowed only on roles tagged CloudsentryManaged=true (an allowlist,
#      so a role you forgot about is safe by default).
#   2. An explicit Deny, which always wins over any Allow, stops the service
#      from ever editing its own role, so it cannot widen its own permissions.
# The application also validates every proposed policy before it is proposed
# and again before it is executed (backend/app/actions/validation.py).
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
    sid       = "CloudsentryTightenTaggedRolePolicies"
    effect    = "Allow"
    actions   = ["iam:PutRolePolicy"]
    resources = ["arn:aws:iam::*:role/*"]

    condition {
      test     = "StringEquals"
      variable = "iam:ResourceTag/CloudsentryManaged"
      values   = ["true"]
    }
  }

  statement {
    sid    = "CloudsentryNeverEditItself"
    effect = "Deny"
    actions = [
      "iam:PutRolePolicy",
      "iam:DeleteRolePolicy",
      "iam:AttachRolePolicy",
      "iam:DetachRolePolicy",
      "iam:UpdateAssumeRolePolicy",
      "iam:PutRolePermissionsBoundary",
      "iam:DeleteRolePermissionsBoundary",
    ]
    resources = [aws_iam_role.cloudsentry_execution_role.arn]
  }
}

resource "aws_iam_role_policy" "scoped_write" {
  name   = "cloudsentry-scoped-write"
  role   = aws_iam_role.cloudsentry_execution_role.id
  policy = data.aws_iam_policy_document.scoped_write.json
}
