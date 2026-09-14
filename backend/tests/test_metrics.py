import datetime
from unittest.mock import patch

from app.graph.metrics import get_metric_snapshot, latest_metric_snapshot


def test_latest_metric_snapshot_returns_last_point():
    datapoints = [
        {"timestamp": "2026-09-09T23:40:00", "value": 120.0},
        {"timestamp": "2026-09-09T23:50:00", "value": 200.0},
    ]

    assert latest_metric_snapshot(datapoints) == {
        "timestamp": "2026-09-09T23:50:00",
        "value": 200.0,
    }


def test_latest_metric_snapshot_returns_none_for_empty_list():
    assert latest_metric_snapshot([]) is None


def test_get_metric_snapshot_uses_ec2_metric_config():
    fixed_now = datetime.datetime(2026, 9, 9, 23, 0)

    with patch("app.graph.metrics.get_cloudwatch_metric") as mock_get_metric:
        mock_get_metric.return_value = [{"timestamp": "2026-09-09T22:55:00", "value": 40.0}]

        snapshot = get_metric_snapshot("ec2", "i-1", client="ec2-cw-client", now=fixed_now)

    assert snapshot == {"timestamp": "2026-09-09T22:55:00", "value": 40.0}
    mock_get_metric.assert_called_once_with(
        namespace="AWS/EC2",
        metric_name="CPUUtilization",
        dimensions={"InstanceId": "i-1"},
        start_time=fixed_now - datetime.timedelta(hours=1),
        end_time=fixed_now,
        stat="Average",
        client="ec2-cw-client",
    )


def test_get_metric_snapshot_uses_lambda_metric_config():
    fixed_now = datetime.datetime(2026, 9, 9, 23, 0)

    with patch("app.graph.metrics.get_cloudwatch_metric", return_value=[]) as mock_get_metric:
        get_metric_snapshot("lambda", "my-service", now=fixed_now)

    call_kwargs = mock_get_metric.call_args.kwargs
    assert call_kwargs["namespace"] == "AWS/Lambda"
    assert call_kwargs["metric_name"] == "Duration"
    assert call_kwargs["dimensions"] == {"FunctionName": "my-service"}


def test_get_metric_snapshot_uses_dynamodb_metric_config():
    fixed_now = datetime.datetime(2026, 9, 9, 23, 0)

    with patch("app.graph.metrics.get_cloudwatch_metric", return_value=[]) as mock_get_metric:
        get_metric_snapshot("dynamodb", "orders", now=fixed_now)

    call_kwargs = mock_get_metric.call_args.kwargs
    assert call_kwargs["namespace"] == "AWS/DynamoDB"
    assert call_kwargs["metric_name"] == "ConsumedReadCapacityUnits"
    assert call_kwargs["dimensions"] == {"TableName": "orders"}
    assert call_kwargs["stat"] == "Sum"
