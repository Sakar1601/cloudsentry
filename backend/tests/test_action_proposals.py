from app.actions.proposals import build_action_tool, propose_action
from app.actions.store import ActionStore

POLICY_PARAMS = {
    "role_name": "orders-fn-role",
    "policy_name": "orders-access",
    "new_policy_document": {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Effect": "Allow",
                "Action": ["dynamodb:GetItem"],
                "Resource": "arn:aws:dynamodb:us-east-1:123456789012:table/orders",
            }
        ],
    },
}


def test_propose_action_creates_pending_action_and_returns_message():
    store = ActionStore(":memory:")

    result = propose_action(store, "cost", "ec2:i-0123456789abcdef0", "stop_ec2_instance", {"instance_id": "i-0123456789abcdef0"})

    assert result["pending_action"]["agent_id"] == "cost"
    assert result["pending_action"]["node_id"] == "ec2:i-0123456789abcdef0"
    assert result["pending_action"]["tool_name"] == "stop_ec2_instance"
    assert result["pending_action"]["params"] == {"instance_id": "i-0123456789abcdef0"}
    assert result["pending_action"]["status"] == "pending"
    action_id = result["pending_action"]["id"]
    assert result["message"] == f"Proposed 'stop_ec2_instance' for human approval (action id {action_id})."


def test_propose_action_persists_to_the_store():
    store = ActionStore(":memory:")

    result = propose_action(store, "security", "lambda:fn", "tighten_iam_policy", POLICY_PARAMS)

    assert store.get(result["pending_action"]["id"]) == result["pending_action"]


def test_build_action_tool_returns_callable_that_proposes_with_given_kwargs():
    store = ActionStore(":memory:")
    tool = build_action_tool(store, "performance", "ec2:i-0fedcba9876543210", "resize_ec2_instance")

    result = tool(instance_id="i-0fedcba9876543210", new_instance_type="t3.small")

    assert result["pending_action"]["agent_id"] == "performance"
    assert result["pending_action"]["node_id"] == "ec2:i-0fedcba9876543210"
    assert result["pending_action"]["tool_name"] == "resize_ec2_instance"
    assert result["pending_action"]["params"] == {"instance_id": "i-0fedcba9876543210", "new_instance_type": "t3.small"}


def test_invalid_proposal_is_refused_and_nothing_is_recorded():
    store = ActionStore(":memory:")

    result = propose_action(store, "cost", "ec2:i-1", "stop_ec2_instance", {"instance_id": "i-1; rm -rf /"})

    assert "pending_action" not in result
    assert result["error"].startswith("Proposal refused")
    assert store.list() == []
