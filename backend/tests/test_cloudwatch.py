from unittest.mock import MagicMock, patch

from app.tools.cloudwatch import get_cloudwatch_logs, get_cloudwatch_metric


def test_get_cloudwatch_logs_returns_parsed_records():
    mock_client = MagicMock()
    mock_client.start_query.return_value = {"queryId": "q-1"}
    mock_client.get_query_results.return_value = {
        "status": "Complete",
        "results": [
            [
                {"field": "@timestamp", "value": "2026-09-09 23:40:00.000"},
                {"field": "@message", "value": "ProvisionedThroughputExceededException"},
            ]
        ],
    }

    with patch("app.tools.cloudwatch.time.sleep"):
        records = get_cloudwatch_logs(
            log_group="/aws/lambda/my-service",
            query="fields @timestamp, @message",
            start_time=1,
            end_time=2,
            client=mock_client,
        )

    assert records == [
        {
            "@timestamp": "2026-09-09 23:40:00.000",
            "@message": "ProvisionedThroughputExceededException",
        }
    ]
    mock_client.start_query.assert_called_once_with(
        logGroupName="/aws/lambda/my-service",
        startTime=1,
        endTime=2,
        queryString="fields @timestamp, @message",
    )


def test_get_cloudwatch_logs_polls_until_complete():
    mock_client = MagicMock()
    mock_client.start_query.return_value = {"queryId": "q-2"}
    mock_client.get_query_results.side_effect = [
        {"status": "Running", "results": []},
        {"status": "Complete", "results": []},
    ]

    with patch("app.tools.cloudwatch.time.sleep"):
        records = get_cloudwatch_logs(
            log_group="/aws/lambda/my-service",
            query="fields @timestamp",
            start_time=1,
            end_time=2,
            client=mock_client,
        )

    assert records == []
    assert mock_client.get_query_results.call_count == 2


def test_get_cloudwatch_logs_raises_on_failed_query():
    mock_client = MagicMock()
    mock_client.start_query.return_value = {"queryId": "q-3"}
    mock_client.get_query_results.return_value = {"status": "Failed", "results": []}

    with patch("app.tools.cloudwatch.time.sleep"):
        try:
            get_cloudwatch_logs(
                log_group="/aws/lambda/my-service",
                query="fields @timestamp",
                start_time=1,
                end_time=2,
                client=mock_client,
            )
            assert False, "expected RuntimeError"
        except RuntimeError as e:
            assert "q-3" in str(e)


def test_get_cloudwatch_metric_returns_sorted_datapoints():
    import datetime

    mock_client = MagicMock()
    mock_client.get_metric_statistics.return_value = {
        "Datapoints": [
            {"Timestamp": datetime.datetime(2026, 9, 9, 23, 50), "Average": 200.0},
            {"Timestamp": datetime.datetime(2026, 9, 9, 23, 40), "Average": 120.0},
        ]
    }

    points = get_cloudwatch_metric(
        namespace="AWS/Lambda",
        metric_name="Duration",
        dimensions={"FunctionName": "my-service"},
        start_time=datetime.datetime(2026, 9, 9, 23, 0),
        end_time=datetime.datetime(2026, 9, 10, 0, 0),
        stat="Average",
        client=mock_client,
    )

    assert points == [
        {"timestamp": "2026-09-09T23:40:00", "value": 120.0},
        {"timestamp": "2026-09-09T23:50:00", "value": 200.0},
    ]
    call_kwargs = mock_client.get_metric_statistics.call_args.kwargs
    assert call_kwargs["Dimensions"] == [{"Name": "FunctionName", "Value": "my-service"}]
