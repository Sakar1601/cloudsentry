from unittest.mock import MagicMock

from app.tools.iam import get_iam_policy_for_role


def test_get_iam_policy_for_role_returns_attached_and_inline():
    mock_client = MagicMock()
    mock_client.list_attached_role_policies.return_value = {
        "AttachedPolicies": [
            {"PolicyName": "AmazonS3ReadOnlyAccess", "PolicyArn": "arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess"}
        ]
    }
    mock_client.get_policy.return_value = {"Policy": {"DefaultVersionId": "v1"}}
    mock_client.get_policy_version.return_value = {
        "PolicyVersion": {"Document": {"Statement": [{"Effect": "Allow", "Action": "s3:Get*"}]}}
    }
    mock_client.list_role_policies.return_value = {"PolicyNames": ["InlineAdminAccess"]}
    mock_client.get_role_policy.return_value = {
        "PolicyDocument": {"Statement": [{"Effect": "Allow", "Action": "*"}]}
    }

    result = get_iam_policy_for_role("my-role", client=mock_client)

    assert result == {
        "role_name": "my-role",
        "attached_policies": [
            {
                "policy_name": "AmazonS3ReadOnlyAccess",
                "policy_arn": "arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess",
                "document": {"Statement": [{"Effect": "Allow", "Action": "s3:Get*"}]},
            }
        ],
        "inline_policies": [
            {
                "policy_name": "InlineAdminAccess",
                "document": {"Statement": [{"Effect": "Allow", "Action": "*"}]},
            }
        ],
    }
    mock_client.list_attached_role_policies.assert_called_once_with(RoleName="my-role")
    mock_client.list_role_policies.assert_called_once_with(RoleName="my-role")
