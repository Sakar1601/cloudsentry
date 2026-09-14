from unittest.mock import MagicMock

from app.tools.cost_explorer import get_cost_and_usage


def test_get_cost_and_usage_without_group_by():
    mock_client = MagicMock()
    mock_client.get_cost_and_usage.return_value = {
        "ResultsByTime": [
            {
                "TimePeriod": {"Start": "2026-09-01", "End": "2026-09-02"},
                "Total": {"UnblendedCost": {"Amount": "12.34", "Unit": "USD"}},
                "Groups": [],
            }
        ]
    }

    result = get_cost_and_usage(
        start_date="2026-09-01",
        end_date="2026-09-02",
        granularity="DAILY",
        client=mock_client,
    )

    assert result == [{"start": "2026-09-01", "end": "2026-09-02", "cost": "12.34"}]
    mock_client.get_cost_and_usage.assert_called_once_with(
        TimePeriod={"Start": "2026-09-01", "End": "2026-09-02"},
        Granularity="DAILY",
        Metrics=["UnblendedCost"],
    )


def test_get_cost_and_usage_with_group_by():
    mock_client = MagicMock()
    mock_client.get_cost_and_usage.return_value = {
        "ResultsByTime": [
            {
                "TimePeriod": {"Start": "2026-09-01", "End": "2026-09-02"},
                "Total": {},
                "Groups": [
                    {
                        "Keys": ["Amazon Elastic Compute Cloud - Compute"],
                        "Metrics": {"UnblendedCost": {"Amount": "9.00", "Unit": "USD"}},
                    }
                ],
            }
        ]
    }

    result = get_cost_and_usage(
        start_date="2026-09-01",
        end_date="2026-09-02",
        granularity="DAILY",
        group_by="SERVICE",
        client=mock_client,
    )

    assert result == [
        {
            "start": "2026-09-01",
            "end": "2026-09-02",
            "groups": [
                {"key": "Amazon Elastic Compute Cloud - Compute", "cost": "9.00"}
            ],
        }
    ]
    call_kwargs = mock_client.get_cost_and_usage.call_args.kwargs
    assert call_kwargs["GroupBy"] == [{"Type": "DIMENSION", "Key": "SERVICE"}]
