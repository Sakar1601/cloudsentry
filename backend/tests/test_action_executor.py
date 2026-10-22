from unittest.mock import patch

from app.actions.executor import execute_action


def test_execute_action_returns_success_with_result():
    action = {"tool_name": "stop_ec2_instance", "params": {"instance_id": "i-0123456789abcdef0"}}

    with patch("app.tools.actions.stop_ec2_instance", return_value={"instance_id": "i-0123456789abcdef0", "action": "stop"}) as mock_stop:
        outcome = execute_action(action, client="fake-client")

    assert outcome == {"success": True, "result": {"instance_id": "i-0123456789abcdef0", "action": "stop"}}
    mock_stop.assert_called_once_with(instance_id="i-0123456789abcdef0", client="fake-client")


def test_execute_action_returns_failure_when_executor_raises():
    action = {"tool_name": "resize_ec2_instance", "params": {"instance_id": "i-0123456789abcdef0", "new_instance_type": "t3.small"}}

    with patch("app.tools.actions.resize_ec2_instance", side_effect=RuntimeError("boto3 boom")):
        outcome = execute_action(action)

    assert outcome == {"success": False, "error": "boto3 boom"}


def test_execute_action_dispatches_tighten_iam_policy():
    action = {
        "tool_name": "tighten_iam_policy",
        "params": {
            "role_name": "r",
            "policy_name": "p",
            "new_policy_document": {
                "Version": "2012-10-17",
                "Statement": [{"Effect": "Allow", "Action": "dynamodb:GetItem", "Resource": "arn:aws:dynamodb:us-east-1:123456789012:table/t"}],
            },
        },
    }

    with patch(
        "app.tools.actions.tighten_iam_policy",
        return_value={"role_name": "r", "policy_name": "p", "action": "tighten_iam_policy"},
    ) as mock_tighten:
        outcome = execute_action(action)

    assert outcome["success"] is True
    mock_tighten.assert_called_once_with(
        role_name="r", policy_name="p", new_policy_document=action["params"]["new_policy_document"], client=None
    )


def test_execute_action_refuses_invalid_params_without_calling_aws():
    action = {"tool_name": "stop_ec2_instance", "params": {"instance_id": "not-an-instance"}}

    with patch("app.tools.actions.stop_ec2_instance") as mock_stop:
        outcome = execute_action(action)

    assert outcome["success"] is False
    assert outcome["error"].startswith("Refused to execute")
    mock_stop.assert_not_called()
