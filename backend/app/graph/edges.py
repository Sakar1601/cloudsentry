from app.graph.nodes import dynamodb_node_id, ec2_node_id, lambda_node_id
from app.tools.iam import get_iam_policy_for_role


def same_vpc_edges(ec2_instances: list[dict]) -> list[dict]:
    by_vpc: dict[str, list[str]] = {}
    for instance in ec2_instances:
        vpc_id = instance.get("vpc_id")
        if not vpc_id:
            continue
        by_vpc.setdefault(vpc_id, []).append(instance["instance_id"])

    edges = []
    for instance_ids in by_vpc.values():
        for i in range(len(instance_ids)):
            for j in range(i + 1, len(instance_ids)):
                edges.append(
                    {
                        "source": ec2_node_id(instance_ids[i]),
                        "target": ec2_node_id(instance_ids[j]),
                        "relation": "same_vpc",
                    }
                )
    return edges


def lambda_env_var_edges(lambda_functions: list[dict], dynamodb_tables: list[dict]) -> list[dict]:
    table_names = [table["table_name"] for table in dynamodb_tables]

    edges = []
    for fn in lambda_functions:
        for value in fn.get("environment", {}).values():
            for table_name in table_names:
                if table_name in value:
                    edges.append(
                        {
                            "source": lambda_node_id(fn["function_name"]),
                            "target": dynamodb_node_id(table_name),
                            "relation": "references",
                        }
                    )
    return edges


def iam_access_edges(
    lambda_functions: list[dict], dynamodb_tables: list[dict], client=None
) -> list[dict]:
    edges = []
    for fn in lambda_functions:
        role_name = fn["role_arn"].rstrip("/").split("/")[-1]
        policy = get_iam_policy_for_role(role_name, client=client)
        all_policies = policy["attached_policies"] + policy["inline_policies"]

        for table in dynamodb_tables:
            if _policies_allow_resource(all_policies, table["table_arn"]):
                edges.append(
                    {
                        "source": lambda_node_id(fn["function_name"]),
                        "target": dynamodb_node_id(table["table_name"]),
                        "relation": "iam_access",
                    }
                )
    return edges


def _policies_allow_resource(policies: list[dict], arn: str) -> bool:
    for policy in policies:
        for statement in policy["document"].get("Statement", []):
            if statement.get("Effect") != "Allow":
                continue
            resource = statement.get("Resource", [])
            resources = resource if isinstance(resource, list) else [resource]
            if any(isinstance(r, str) and arn in r for r in resources):
                return True
    return False
