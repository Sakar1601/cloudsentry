from app.actions.proposals import build_action_tool, propose_action
from app.actions.store import ActionStore


def test_propose_action_creates_pending_action_and_returns_message():
    store = ActionStore(":memory:")

    result = propose_action(store, "cost", "ec2:i-1", "stop_ec2_instance", {"instance_id": "i-1"})

    assert result["pending_action"]["agent_id"] == "cost"
    assert result["pending_action"]["node_id"] == "ec2:i-1"
    assert result["pending_action"]["tool_name"] == "stop_ec2_instance"
    assert result["pending_action"]["params"] == {"instance_id": "i-1"}
    assert result["pending_action"]["status"] == "pending"
    action_id = result["pending_action"]["id"]
    assert result["message"] == f"Proposed 'stop_ec2_instance' for human approval (action id {action_id})."


def test_propose_action_persists_to_the_store():
    store = ActionStore(":memory:")

    result = propose_action(store, "security", "lambda:fn", "tighten_iam_policy", {"role_name": "r"})

    assert store.get(result["pending_action"]["id"]) == result["pending_action"]


def test_build_action_tool_returns_callable_that_proposes_with_given_kwargs():
    store = ActionStore(":memory:")
    tool = build_action_tool(store, "performance", "ec2:i-2", "resize_ec2_instance")

    result = tool(instance_id="i-2", new_instance_type="t3.small")

    assert result["pending_action"]["agent_id"] == "performance"
    assert result["pending_action"]["node_id"] == "ec2:i-2"
    assert result["pending_action"]["tool_name"] == "resize_ec2_instance"
    assert result["pending_action"]["params"] == {"instance_id": "i-2", "new_instance_type": "t3.small"}
