import os
import time

from app.graph.cost import build_cost_by_resource_type
from app.graph.edges import iam_access_edges, lambda_env_var_edges, same_vpc_edges
from app.graph.metrics import get_metric_snapshot
from app.graph.nodes import build_dynamodb_node, build_ec2_node, build_lambda_node
from app.tools.compute import list_ec2_instances, list_lambda_functions
from app.tools.dynamodb import list_dynamodb_tables

# Cost Explorer bills per request (about $0.01) and its data is daily, so
# calling it on every 30s poll would cost roughly $29/day for no new
# information. The real (non-injected) client path is cached for an hour.
COST_TTL_SECONDS = float(os.environ.get("CLOUDSENTRY_COST_TTL", "3600"))
_cost_cache: dict = {"at": None, "value": None}


def _cost_by_type(clients: dict) -> dict[str, float]:
    if clients.get("ce") is not None:
        return build_cost_by_resource_type(client=clients["ce"])

    now = time.monotonic()
    if _cost_cache["at"] is None or now - _cost_cache["at"] >= COST_TTL_SECONDS:
        _cost_cache["value"] = build_cost_by_resource_type()
        _cost_cache["at"] = now
    return _cost_cache["value"]


def build_graph(clients: dict | None = None) -> dict:
    clients = clients or {}

    ec2_instances = list_ec2_instances(client=clients.get("ec2"))
    lambda_functions = list_lambda_functions(client=clients.get("lambda"))
    dynamodb_tables = list_dynamodb_tables(client=clients.get("dynamodb"))

    cost_by_type = _cost_by_type(clients)

    nodes: dict[str, dict] = {}

    for instance in ec2_instances:
        node = build_ec2_node(instance)
        node["cost_7d"] = cost_by_type.get("ec2")
        node["last_metric_snapshot"] = get_metric_snapshot(
            "ec2", instance["instance_id"], client=clients.get("cloudwatch")
        )
        nodes[node["node_id"]] = node

    for function in lambda_functions:
        node = build_lambda_node(function)
        node["cost_7d"] = cost_by_type.get("lambda")
        node["last_metric_snapshot"] = get_metric_snapshot(
            "lambda", function["function_name"], client=clients.get("cloudwatch")
        )
        nodes[node["node_id"]] = node

    for table in dynamodb_tables:
        node = build_dynamodb_node(table)
        node["cost_7d"] = cost_by_type.get("dynamodb")
        node["last_metric_snapshot"] = get_metric_snapshot(
            "dynamodb", table["table_name"], client=clients.get("cloudwatch")
        )
        nodes[node["node_id"]] = node

    edges = (
        same_vpc_edges(ec2_instances)
        + lambda_env_var_edges(lambda_functions, dynamodb_tables)
        + iam_access_edges(lambda_functions, dynamodb_tables, client=clients.get("iam"))
    )

    return {"nodes": nodes, "edges": edges}
