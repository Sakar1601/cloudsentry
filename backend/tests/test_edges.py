from unittest.mock import patch

from app.graph.edges import (
    iam_access_edges,
    lambda_env_var_edges,
    same_vpc_edges,
)


def test_same_vpc_edges_links_instances_sharing_a_vpc():
    instances = [
        {"instance_id": "i-1", "vpc_id": "vpc-1"},
        {"instance_id": "i-2", "vpc_id": "vpc-1"},
        {"instance_id": "i-3", "vpc_id": "vpc-2"},
    ]

    edges = same_vpc_edges(instances)

    assert edges == [{"source": "ec2:i-1", "target": "ec2:i-2", "relation": "same_vpc"}]


def test_same_vpc_edges_ignores_instances_without_vpc():
    instances = [
        {"instance_id": "i-1", "vpc_id": None},
        {"instance_id": "i-2", "vpc_id": None},
    ]

    assert same_vpc_edges(instances) == []


def test_lambda_env_var_edges_matches_table_name_in_env_value():
    lambda_functions = [
        {"function_name": "my-service", "environment": {"TABLE_NAME": "orders"}}
    ]
    dynamodb_tables = [{"table_name": "orders", "table_arn": "arn:...:table/orders"}]

    edges = lambda_env_var_edges(lambda_functions, dynamodb_tables)

    assert edges == [
        {"source": "lambda:my-service", "target": "dynamodb:orders", "relation": "references"}
    ]


def test_lambda_env_var_edges_no_match_returns_empty():
    lambda_functions = [{"function_name": "my-service", "environment": {"LOG_LEVEL": "info"}}]
    dynamodb_tables = [{"table_name": "orders", "table_arn": "arn:...:table/orders"}]

    assert lambda_env_var_edges(lambda_functions, dynamodb_tables) == []


def test_iam_access_edges_matches_allow_statement_referencing_table_arn():
    lambda_functions = [
        {
            "function_name": "my-service",
            "role_arn": "arn:aws:iam::123456789012:role/my-service-role",
        }
    ]
    dynamodb_tables = [
        {"table_name": "orders", "table_arn": "arn:aws:dynamodb:us-east-1:123456789012:table/orders"}
    ]

    fake_policy = {
        "role_name": "my-service-role",
        "attached_policies": [
            {
                "policy_name": "OrdersAccess",
                "policy_arn": "arn:aws:iam::123456789012:policy/OrdersAccess",
                "document": {
                    "Statement": [
                        {
                            "Effect": "Allow",
                            "Action": "dynamodb:*",
                            "Resource": "arn:aws:dynamodb:us-east-1:123456789012:table/orders",
                        }
                    ]
                },
            }
        ],
        "inline_policies": [],
    }

    with patch("app.graph.edges.get_iam_policy_for_role", return_value=fake_policy) as mock_get_policy:
        edges = iam_access_edges(lambda_functions, dynamodb_tables)

    assert edges == [
        {"source": "lambda:my-service", "target": "dynamodb:orders", "relation": "iam_access"}
    ]
    mock_get_policy.assert_called_once_with("my-service-role", client=None)


def test_iam_access_edges_ignores_deny_statements():
    lambda_functions = [
        {"function_name": "my-service", "role_arn": "arn:aws:iam::123456789012:role/my-role"}
    ]
    dynamodb_tables = [
        {"table_name": "orders", "table_arn": "arn:aws:dynamodb:us-east-1:123456789012:table/orders"}
    ]
    fake_policy = {
        "role_name": "my-role",
        "attached_policies": [],
        "inline_policies": [
            {
                "policy_name": "DenyOrders",
                "document": {
                    "Statement": [
                        {
                            "Effect": "Deny",
                            "Action": "dynamodb:*",
                            "Resource": "arn:aws:dynamodb:us-east-1:123456789012:table/orders",
                        }
                    ]
                },
            }
        ],
    }

    with patch("app.graph.edges.get_iam_policy_for_role", return_value=fake_policy):
        edges = iam_access_edges(lambda_functions, dynamodb_tables)

    assert edges == []
