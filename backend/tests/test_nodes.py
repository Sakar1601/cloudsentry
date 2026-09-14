from app.graph.nodes import (
    build_dynamodb_node,
    build_ec2_node,
    build_lambda_node,
    dynamodb_node_id,
    ec2_node_id,
    lambda_node_id,
)


def test_ec2_node_id_is_prefixed_and_stable():
    assert ec2_node_id("i-0123abc") == "ec2:i-0123abc"
    assert ec2_node_id("i-0123abc") == ec2_node_id("i-0123abc")


def test_lambda_node_id_is_prefixed():
    assert lambda_node_id("my-service") == "lambda:my-service"


def test_dynamodb_node_id_is_prefixed():
    assert dynamodb_node_id("orders") == "dynamodb:orders"


def test_build_ec2_node_uses_name_tag_when_present():
    instance = {
        "instance_id": "i-1",
        "state": "running",
        "instance_type": "t3.micro",
        "launch_time": "2026-09-09T10:00:00",
        "tags": {"Name": "dev-box"},
        "vpc_id": "vpc-1",
    }

    node = build_ec2_node(instance)

    assert node == {
        "node_id": "ec2:i-1",
        "resource_type": "ec2",
        "name": "dev-box",
        "state": "running",
        "tags": {"Name": "dev-box"},
        "cost_7d": None,
        "last_metric_snapshot": None,
    }


def test_build_ec2_node_falls_back_to_instance_id_when_no_name_tag():
    instance = {
        "instance_id": "i-2",
        "state": "running",
        "instance_type": "t3.micro",
        "launch_time": "2026-09-09T10:00:00",
        "tags": {},
        "vpc_id": None,
    }

    node = build_ec2_node(instance)

    assert node["name"] == "i-2"


def test_build_lambda_node():
    function = {
        "function_name": "my-service",
        "runtime": "python3.12",
        "memory_size": 128,
        "timeout": 10,
        "role_arn": "arn:aws:iam::123456789012:role/my-service-role",
        "environment": {"TABLE_NAME": "orders"},
    }

    node = build_lambda_node(function)

    assert node == {
        "node_id": "lambda:my-service",
        "resource_type": "lambda",
        "name": "my-service",
        "state": "active",
        "tags": {},
        "cost_7d": None,
        "last_metric_snapshot": None,
    }


def test_build_dynamodb_node():
    table = {
        "table_name": "orders",
        "table_arn": "arn:aws:dynamodb:us-east-1:123456789012:table/orders",
        "status": "ACTIVE",
        "item_count": 5,
        "table_size_bytes": 1024,
        "billing_mode": "PAY_PER_REQUEST",
    }

    node = build_dynamodb_node(table)

    assert node == {
        "node_id": "dynamodb:orders",
        "resource_type": "dynamodb",
        "name": "orders",
        "state": "ACTIVE",
        "tags": {},
        "cost_7d": None,
        "last_metric_snapshot": None,
    }
