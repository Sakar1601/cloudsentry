import json
from unittest.mock import MagicMock

from app.tools.actions import resize_ec2_instance, stop_ec2_instance, tighten_iam_policy


def test_stop_ec2_instance_calls_stop_instances():
    mock_client = MagicMock()

    result = stop_ec2_instance("i-0123abc", client=mock_client)

    assert result == {"instance_id": "i-0123abc", "action": "stop"}
    mock_client.stop_instances.assert_called_once_with(InstanceIds=["i-0123abc"])


def test_resize_ec2_instance_calls_modify_instance_attribute():
    mock_client = MagicMock()

    result = resize_ec2_instance("i-0123abc", "t3.small", client=mock_client)

    assert result == {
        "instance_id": "i-0123abc",
        "new_instance_type": "t3.small",
        "action": "resize",
    }
    mock_client.modify_instance_attribute.assert_called_once_with(
        InstanceId="i-0123abc", InstanceType={"Value": "t3.small"}
    )


def test_tighten_iam_policy_calls_put_role_policy():
    mock_client = MagicMock()
    policy_document = {"Statement": [{"Effect": "Allow", "Action": "s3:GetObject", "Resource": "*"}]}

    result = tighten_iam_policy("my-role", "MyPolicy", policy_document, client=mock_client)

    assert result == {"role_name": "my-role", "policy_name": "MyPolicy", "action": "tighten_iam_policy"}
    mock_client.put_role_policy.assert_called_once_with(
        RoleName="my-role", PolicyName="MyPolicy", PolicyDocument=json.dumps(policy_document)
    )
