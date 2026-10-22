"""Scripted stand-in for `app.agents.investigate.investigate_node`.

Same signature and return shape, but no LLM call: it pretends to work for a
moment, then returns a canned finding and — for a few well-chosen nodes —
proposes a real pending action through the same action tool the live agents
use, so the approve/reject flow, audit log and WebSocket events are the real
code paths.
"""

import asyncio
import random

THINK_SECONDS = (2.0, 4.0)

FINDINGS = {
    "cost": (
        "Spend on {name} is running well above its recent baseline "
        "(${cost:.2f} over 7 days). Utilisation does not justify it; this looks like "
        "spend that should be reviewed or stopped."
    ),
    "performance": (
        "{name} shows a sustained spike versus its recent average ({value:.0f} on its "
        "primary metric). The workload looks under-provisioned for current traffic; "
        "a larger size would remove the pressure."
    ),
    "security": (
        "{name}'s execution role grants broader access than its code uses "
        "(wildcard resource on its data-plane actions). I'd narrow it to the specific "
        "tables it actually touches."
    ),
}


def _agent_of(focus: str) -> str:
    if "cost" in focus:
        return "cost"
    if "performance" in focus:
        return "performance"
    return "security"


def make_demo_investigator():
    proposed: set[tuple[str, str]] = set()

    async def demo_investigate_node(node, investigation_focus, tool_definitions, tool_dispatch, client=None):
        await asyncio.sleep(random.uniform(*THINK_SECONDS))
        agent = _agent_of(investigation_focus)
        snapshot = node.get("last_metric_snapshot") or {}
        text = FINDINGS[agent].format(
            name=node["name"], cost=node.get("cost_7d") or 0.0, value=snapshot.get("value") or 0.0
        )

        actions: list[dict] = []
        key = (agent, node["node_id"])
        if key not in proposed:
            result = _propose(agent, node, tool_dispatch)
            if result is not None:
                proposed.add(key)
                actions.append(result["pending_action"])
        return text, actions

    return demo_investigate_node


def _propose(agent: str, node: dict, tool_dispatch: dict) -> dict | None:
    if agent == "cost" and node["resource_type"] == "ec2":
        return tool_dispatch["stop_ec2_instance"](instance_id=node["node_id"].split(":", 1)[1])
    if agent == "performance" and node["resource_type"] == "ec2":
        return tool_dispatch["resize_ec2_instance"](
            instance_id=node["node_id"].split(":", 1)[1], new_instance_type="m5.xlarge"
        )
    if agent == "security" and node["resource_type"] == "lambda":
        role = f"{node['name']}-role"
        return tool_dispatch["tighten_iam_policy"](
            role_name=role,
            policy_name=f"{node['name']}-data-access",
            new_policy_document={
                "Version": "2012-10-17",
                "Statement": [
                    {
                        "Effect": "Allow",
                        "Action": ["dynamodb:GetItem", "dynamodb:PutItem"],
                        "Resource": "arn:aws:dynamodb:us-east-1:123456789012:table/orders",
                    }
                ],
            },
        )
    return None
