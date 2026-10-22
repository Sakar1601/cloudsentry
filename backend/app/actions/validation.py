"""Strict validation of every action an agent proposes.

The model's output is untrusted: it reads text from your account (tags, log
lines, environment variables) that anyone able to write there can influence, so
a proposed action could be the result of prompt injection. A human approves
each action, but the safest approval is one that can only be for something
sane, so parameters are checked against tight patterns when an action is
proposed AND again just before it executes.
"""

import json
import re

INSTANCE_ID = re.compile(r"^i-[0-9a-f]{8,17}$")
INSTANCE_TYPE = re.compile(r"^[a-z0-9][a-z0-9-]{0,20}\.[a-z0-9]{3,16}$")
IAM_NAME = re.compile(r"^[\w+=,.@-]{1,64}$")
IAM_ACTION = re.compile(r"^[a-z0-9-]+:[A-Za-z0-9*]+$")

POLICY_VERSIONS = {"2012-10-17", "2008-10-17"}
MAX_POLICY_CHARS = 6144
MAX_STATEMENTS = 20
ALLOWED_STATEMENT_KEYS = {"Sid", "Effect", "Action", "Resource", "Condition"}

# Granting any of these lets a role grow its own (or another identity's)
# permissions, so a "tightened" policy must never allow them.
PRIVILEGE_ESCALATION_ACTIONS = {
    "iam:*",
    "sts:*",
    "organizations:*",
    "iam:passrole",
    "iam:putrolepolicy",
    "iam:attachrolepolicy",
    "iam:createpolicyversion",
    "iam:setdefaultpolicyversion",
    "iam:updateassumerolepolicy",
    "iam:createaccesskey",
    "iam:createloginprofile",
    "iam:putuserpolicy",
    "iam:attachuserpolicy",
    "iam:putgrouppolicy",
    "iam:attachgrouppolicy",
    "sts:assumerole",
}


class InvalidAction(ValueError):
    """The proposed action's parameters are not acceptable."""


def _as_list(value, field: str) -> list:
    items = value if isinstance(value, list) else [value]
    if not items or not all(isinstance(item, str) for item in items):
        raise InvalidAction(f"{field} must be a string or a non-empty list of strings")
    return items


def _validate_policy_document(document) -> None:
    if not isinstance(document, dict):
        raise InvalidAction("new_policy_document must be an object")
    if document.get("Version") not in POLICY_VERSIONS:
        raise InvalidAction("policy Version must be 2012-10-17")
    if len(json.dumps(document)) > MAX_POLICY_CHARS:
        raise InvalidAction("policy document is too large")

    statements = document.get("Statement")
    if not isinstance(statements, list) or not 0 < len(statements) <= MAX_STATEMENTS:
        raise InvalidAction(f"policy needs between 1 and {MAX_STATEMENTS} statements")

    for statement in statements:
        if not isinstance(statement, dict):
            raise InvalidAction("each policy statement must be an object")
        unknown = set(statement) - ALLOWED_STATEMENT_KEYS
        if unknown:
            raise InvalidAction(f"unsupported policy statement keys: {sorted(unknown)}")
        if statement.get("Effect") not in {"Allow", "Deny"}:
            raise InvalidAction("statement Effect must be Allow or Deny")
        if "Action" not in statement or "Resource" not in statement:
            raise InvalidAction("each statement needs Action and Resource")

        actions = _as_list(statement["Action"], "Action")
        resources = _as_list(statement["Resource"], "Resource")
        if statement["Effect"] == "Deny":
            continue

        for action in actions:
            if action == "*" or not IAM_ACTION.match(action):
                raise InvalidAction(f"action {action!r} is not allowed in a tightened policy")
            if action.lower() in PRIVILEGE_ESCALATION_ACTIONS:
                raise InvalidAction(f"action {action!r} can escalate privileges")
            if action.endswith("*") and "*" in resources:
                raise InvalidAction("a wildcard action on Resource '*' is not a tightening")


def validate_action(tool_name: str, params: dict) -> dict:
    """Return a clean copy of `params`, or raise InvalidAction."""
    if not isinstance(params, dict):
        raise InvalidAction("params must be an object")

    def only(*keys: str) -> None:
        if set(params) != set(keys):
            raise InvalidAction(f"{tool_name} takes exactly: {', '.join(keys)}")

    if tool_name == "stop_ec2_instance":
        only("instance_id")
        if not INSTANCE_ID.match(str(params["instance_id"])):
            raise InvalidAction("instance_id is not a valid EC2 instance id")
        return {"instance_id": params["instance_id"]}

    if tool_name == "resize_ec2_instance":
        only("instance_id", "new_instance_type")
        if not INSTANCE_ID.match(str(params["instance_id"])):
            raise InvalidAction("instance_id is not a valid EC2 instance id")
        if not INSTANCE_TYPE.match(str(params["new_instance_type"])):
            raise InvalidAction("new_instance_type is not a valid instance type")
        return {"instance_id": params["instance_id"], "new_instance_type": params["new_instance_type"]}

    if tool_name == "tighten_iam_policy":
        only("role_name", "policy_name", "new_policy_document")
        for field in ("role_name", "policy_name"):
            if not IAM_NAME.match(str(params[field])):
                raise InvalidAction(f"{field} is not a valid IAM name")
        _validate_policy_document(params["new_policy_document"])
        return {
            "role_name": params["role_name"],
            "policy_name": params["policy_name"],
            "new_policy_document": params["new_policy_document"],
        }

    raise InvalidAction(f"unknown action tool {tool_name!r}")
