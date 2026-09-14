def ec2_node_id(instance_id: str) -> str:
    return f"ec2:{instance_id}"


def lambda_node_id(function_name: str) -> str:
    return f"lambda:{function_name}"


def dynamodb_node_id(table_name: str) -> str:
    return f"dynamodb:{table_name}"


def build_ec2_node(instance: dict) -> dict:
    return {
        "node_id": ec2_node_id(instance["instance_id"]),
        "resource_type": "ec2",
        "name": instance["tags"].get("Name", instance["instance_id"]),
        "state": instance["state"],
        "tags": instance["tags"],
        "cost_7d": None,
        "last_metric_snapshot": None,
    }


def build_lambda_node(function: dict) -> dict:
    return {
        "node_id": lambda_node_id(function["function_name"]),
        "resource_type": "lambda",
        "name": function["function_name"],
        "state": "active",
        "tags": {},
        "cost_7d": None,
        "last_metric_snapshot": None,
    }


def build_dynamodb_node(table: dict) -> dict:
    return {
        "node_id": dynamodb_node_id(table["table_name"]),
        "resource_type": "dynamodb",
        "name": table["table_name"],
        "state": table["status"],
        "tags": {},
        "cost_7d": None,
        "last_metric_snapshot": None,
    }
