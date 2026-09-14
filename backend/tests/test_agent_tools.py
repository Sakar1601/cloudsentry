import datetime
from unittest.mock import patch

from app.agents.tools import (
    COST_TOOL_NAMES,
    PERFORMANCE_TOOL_NAMES,
    SECURITY_TOOL_NAMES,
    tool_subset,
)


def test_cost_tool_names_match_spec():
    assert COST_TOOL_NAMES == ["get_cost_and_usage", "list_ec2_instances", "list_lambda_functions"]


def test_performance_tool_names_match_spec():
    assert PERFORMANCE_TOOL_NAMES == [
        "get_cloudwatch_metric",
        "get_cloudwatch_logs",
        "list_lambda_functions",
        "list_ec2_instances",
    ]


def test_security_tool_names_match_spec():
    assert SECURITY_TOOL_NAMES == [
        "get_iam_policy_for_role",
        "list_ec2_instances",
        "list_lambda_functions",
    ]


def test_tool_subset_returns_matching_definitions_and_dispatch():
    definitions, dispatch = tool_subset(COST_TOOL_NAMES)

    assert {d["name"] for d in definitions} == set(COST_TOOL_NAMES)
    assert set(dispatch.keys()) == set(COST_TOOL_NAMES)
    assert callable(dispatch["list_ec2_instances"])


def test_tool_subset_definitions_have_input_schema():
    definitions, _ = tool_subset(SECURITY_TOOL_NAMES)
    for definition in definitions:
        assert "description" in definition
        assert definition["input_schema"]["type"] == "object"


def test_cloudwatch_metric_tool_adapter_parses_iso_timestamps():
    _, dispatch = tool_subset(PERFORMANCE_TOOL_NAMES)

    with patch("app.agents.tools.get_cloudwatch_metric", return_value=[]) as mock_get_metric:
        dispatch["get_cloudwatch_metric"](
            namespace="AWS/Lambda",
            metric_name="Duration",
            dimensions={"FunctionName": "my-service"},
            start_time="2026-09-14T00:00:00",
            end_time="2026-09-14T01:00:00",
            stat="Average",
        )

    mock_get_metric.assert_called_once_with(
        namespace="AWS/Lambda",
        metric_name="Duration",
        dimensions={"FunctionName": "my-service"},
        start_time=datetime.datetime(2026, 9, 14, 0, 0, 0),
        end_time=datetime.datetime(2026, 9, 14, 1, 0, 0),
        stat="Average",
        client=None,
    )
