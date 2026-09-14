from unittest.mock import patch

from app.actions.executor import execute_action


def test_execute_action_returns_success_with_result():
    action = {"tool_name": "stop_ec2_instance", "params": {"instance_id": "i-1"}}

    with patch("app.actions.executor.stop_ec2_instance", return_value={"instance_id": "i-1", "action": "stop"}) as mock_stop:
        outcome = execute_action(action, client="fake-client")

    assert outcome == {"success": True, "result": {"instance_id": "i-1", "action": "stop"}}
    mock_stop.assert_called_once_with(instance_id="i-1", client="fake-client")


def test_execute_action_returns_failure_when_executor_raises():
    action = {"tool_name": "resize_ec2_instance", "params": {"instance_id": "i-1", "new_instance_type": "t3.small"}}

    with patch("app.actions.executor.resize_ec2_instance", side_effect=RuntimeError("boto3 boom")):
        outcome = execute_action(action)

    assert outcome == {"success": False, "error": "boto3 boom"}


def test_execute_action_dispatches_tighten_iam_policy():
    action = {
        "tool_name": "tighten_iam_policy",
        "params": {"role_name": "r", "policy_name": "p", "new_policy_document": {"Statement": []}},
    }

    with patch(
        "app.actions.executor.tighten_iam_policy",
        return_value={"role_name": "r", "policy_name": "p", "action": "tighten_iam_policy"},
    ) as mock_tighten:
        outcome = execute_action(action)

    assert outcome["success"] is True
    mock_tighten.assert_called_once_with(
        role_name="r", policy_name="p", new_policy_document={"Statement": []}, client=None
    )
