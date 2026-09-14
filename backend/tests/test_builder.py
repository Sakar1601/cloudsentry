import datetime
from unittest.mock import MagicMock

from app.graph.builder import build_graph


def test_build_graph_wires_nodes_and_edges_from_real_boto3_shapes():
    ec2_client = MagicMock()
    ec2_client.describe_instances.return_value = {
        "Reservations": [
            {
                "Instances": [
                    {
                        "InstanceId": "i-1",
                        "State": {"Name": "running"},
                        "InstanceType": "t3.micro",
                        "LaunchTime": datetime.datetime(2026, 9, 9, 10, 0),
                        "Tags": [{"Key": "Name", "Value": "web"}],
                        "VpcId": "vpc-1",
                    }
                ]
            }
        ]
    }

    lambda_client = MagicMock()
    lambda_client.list_functions.return_value = {
        "Functions": [
            {
                "FunctionName": "my-service",
                "Runtime": "python3.12",
                "MemorySize": 128,
                "Timeout": 10,
                "Role": "arn:aws:iam::123456789012:role/my-service-role",
                "Environment": {"Variables": {"TABLE_NAME": "orders"}},
            }
        ]
    }

    dynamodb_client = MagicMock()
    dynamodb_client.list_tables.return_value = {"TableNames": ["orders"]}
    dynamodb_client.describe_table.return_value = {
        "Table": {
            "TableName": "orders",
            "TableArn": "arn:aws:dynamodb:us-east-1:123456789012:table/orders",
            "TableStatus": "ACTIVE",
            "ItemCount": 5,
            "TableSizeBytes": 1024,
            "BillingModeSummary": {"BillingMode": "PAY_PER_REQUEST"},
        }
    }

    ce_client = MagicMock()
    ce_client.get_cost_and_usage.return_value = {
        "ResultsByTime": [
            {
                "TimePeriod": {"Start": "2026-09-08", "End": "2026-09-09"},
                "Total": {},
                "Groups": [
                    {
                        "Keys": ["Amazon Elastic Compute Cloud - Compute"],
                        "Metrics": {"UnblendedCost": {"Amount": "3.50"}},
                    },
                    {
                        "Keys": ["AWS Lambda"],
                        "Metrics": {"UnblendedCost": {"Amount": "0.10"}},
                    },
                    {
                        "Keys": ["Amazon DynamoDB"],
                        "Metrics": {"UnblendedCost": {"Amount": "0.05"}},
                    },
                ],
            }
        ]
    }

    cloudwatch_client = MagicMock()
    cloudwatch_client.get_metric_statistics.return_value = {
        "Datapoints": [{"Timestamp": datetime.datetime(2026, 9, 9, 22, 55), "Average": 12.0, "Sum": 12.0}]
    }

    iam_client = MagicMock()
    iam_client.list_attached_role_policies.return_value = {
        "AttachedPolicies": [
            {
                "PolicyName": "OrdersAccess",
                "PolicyArn": "arn:aws:iam::123456789012:policy/OrdersAccess",
            }
        ]
    }
    iam_client.get_policy.return_value = {"Policy": {"DefaultVersionId": "v1"}}
    iam_client.get_policy_version.return_value = {
        "PolicyVersion": {
            "Document": {
                "Statement": [
                    {
                        "Effect": "Allow",
                        "Action": "dynamodb:*",
                        "Resource": "arn:aws:dynamodb:us-east-1:123456789012:table/orders",
                    }
                ]
            }
        }
    }
    iam_client.list_role_policies.return_value = {"PolicyNames": []}

    graph = build_graph(
        clients={
            "ec2": ec2_client,
            "lambda": lambda_client,
            "dynamodb": dynamodb_client,
            "ce": ce_client,
            "cloudwatch": cloudwatch_client,
            "iam": iam_client,
        }
    )

    assert set(graph["nodes"].keys()) == {"ec2:i-1", "lambda:my-service", "dynamodb:orders"}

    ec2_node = graph["nodes"]["ec2:i-1"]
    assert ec2_node["resource_type"] == "ec2"
    assert ec2_node["cost_7d"] == 3.5
    assert ec2_node["last_metric_snapshot"] == {"timestamp": "2026-09-09T22:55:00", "value": 12.0}

    lambda_node = graph["nodes"]["lambda:my-service"]
    assert lambda_node["cost_7d"] == 0.1

    dynamodb_node = graph["nodes"]["dynamodb:orders"]
    assert dynamodb_node["cost_7d"] == 0.05

    assert {
        "source": "lambda:my-service",
        "target": "dynamodb:orders",
        "relation": "references",
    } in graph["edges"]
    assert {
        "source": "lambda:my-service",
        "target": "dynamodb:orders",
        "relation": "iam_access",
    } in graph["edges"]
    assert not any(edge["relation"] == "same_vpc" for edge in graph["edges"])


def test_build_graph_defaults_to_empty_clients_dict():
    result = build_graph(clients={"ec2": MagicMock(describe_instances=MagicMock(return_value={"Reservations": []})),
                                   "lambda": MagicMock(list_functions=MagicMock(return_value={"Functions": []})),
                                   "dynamodb": MagicMock(list_tables=MagicMock(return_value={"TableNames": []})),
                                   "ce": MagicMock(get_cost_and_usage=MagicMock(return_value={"ResultsByTime": []})),
                                   "cloudwatch": MagicMock(),
                                   "iam": MagicMock()})

    assert result == {"nodes": {}, "edges": []}
