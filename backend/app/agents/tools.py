import datetime

from app.tools.cloudwatch import get_cloudwatch_logs, get_cloudwatch_metric
from app.tools.compute import list_ec2_instances, list_lambda_functions
from app.tools.cost_explorer import get_cost_and_usage
from app.tools.iam import get_iam_policy_for_role

COST_TOOL_NAMES = ["get_cost_and_usage", "list_ec2_instances", "list_lambda_functions"]
PERFORMANCE_TOOL_NAMES = [
    "get_cloudwatch_metric",
    "get_cloudwatch_logs",
    "list_lambda_functions",
    "list_ec2_instances",
]
SECURITY_TOOL_NAMES = ["get_iam_policy_for_role", "list_ec2_instances", "list_lambda_functions"]


def _get_cloudwatch_metric_from_tool_call(
    namespace: str,
    metric_name: str,
    dimensions: dict,
    start_time: str,
    end_time: str,
    stat: str,
    client=None,
) -> list[dict]:
    return get_cloudwatch_metric(
        namespace=namespace,
        metric_name=metric_name,
        dimensions=dimensions,
        start_time=datetime.datetime.fromisoformat(start_time),
        end_time=datetime.datetime.fromisoformat(end_time),
        stat=stat,
        client=client,
    )


_ALL_TOOL_DEFINITIONS = {
    "get_cost_and_usage": {
        "name": "get_cost_and_usage",
        "description": "Wrap Cost Explorer GetCostAndUsage to return cost totals, optionally grouped by a dimension.",
        "input_schema": {
            "type": "object",
            "properties": {
                "start_date": {"type": "string", "description": "YYYY-MM-DD"},
                "end_date": {"type": "string", "description": "YYYY-MM-DD"},
                "granularity": {"type": "string", "enum": ["DAILY", "MONTHLY", "HOURLY"]},
                "group_by": {"type": "string", "description": "e.g. SERVICE"},
            },
            "required": ["start_date", "end_date"],
        },
    },
    "list_ec2_instances": {
        "name": "list_ec2_instances",
        "description": "Describe EC2 instances with state, type, launch time, tags, and VPC id.",
        "input_schema": {
            "type": "object",
            "properties": {
                "filters": {
                    "type": "array",
                    "description": "EC2 describe_instances Filters list",
                    "items": {"type": "object"},
                },
            },
        },
    },
    "list_lambda_functions": {
        "name": "list_lambda_functions",
        "description": "List Lambda functions with runtime, memory, timeout config, role ARN, and environment variables.",
        "input_schema": {"type": "object", "properties": {}},
    },
    "get_cloudwatch_metric": {
        "name": "get_cloudwatch_metric",
        "description": "Return a CloudWatch metric datapoint series for the given namespace/metric/dimensions.",
        "input_schema": {
            "type": "object",
            "properties": {
                "namespace": {"type": "string"},
                "metric_name": {"type": "string"},
                "dimensions": {"type": "object", "description": "Dimension name/value pairs"},
                "start_time": {"type": "string", "description": "ISO 8601 timestamp"},
                "end_time": {"type": "string", "description": "ISO 8601 timestamp"},
                "stat": {"type": "string", "description": "e.g. Average, Sum, Maximum"},
            },
            "required": ["namespace", "metric_name", "dimensions", "start_time", "end_time", "stat"],
        },
    },
    "get_cloudwatch_logs": {
        "name": "get_cloudwatch_logs",
        "description": "Run a CloudWatch Logs Insights query against a log group and return matched log records.",
        "input_schema": {
            "type": "object",
            "properties": {
                "log_group": {"type": "string"},
                "query": {"type": "string"},
                "start_time": {"type": "integer", "description": "Unix epoch seconds"},
                "end_time": {"type": "integer", "description": "Unix epoch seconds"},
            },
            "required": ["log_group", "query", "start_time", "end_time"],
        },
    },
    "get_iam_policy_for_role": {
        "name": "get_iam_policy_for_role",
        "description": "Return an IAM role's attached and inline policy documents for analysis.",
        "input_schema": {
            "type": "object",
            "properties": {"role_name": {"type": "string"}},
            "required": ["role_name"],
        },
    },
}

_ALL_TOOL_DISPATCH = {
    "get_cost_and_usage": get_cost_and_usage,
    "list_ec2_instances": list_ec2_instances,
    "list_lambda_functions": list_lambda_functions,
    "get_cloudwatch_metric": _get_cloudwatch_metric_from_tool_call,
    "get_cloudwatch_logs": get_cloudwatch_logs,
    "get_iam_policy_for_role": get_iam_policy_for_role,
}


def tool_subset(names: list[str]) -> tuple[list[dict], dict]:
    definitions = [_ALL_TOOL_DEFINITIONS[name] for name in names]
    dispatch = {name: _ALL_TOOL_DISPATCH[name] for name in names}
    return definitions, dispatch
