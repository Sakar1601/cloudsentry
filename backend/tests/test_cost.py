import datetime
from unittest.mock import patch

from app.graph.cost import build_cost_by_resource_type


def test_build_cost_by_resource_type_sums_known_services():
    fixture = [
        {
            "start": "2026-09-07",
            "end": "2026-09-08",
            "groups": [
                {"key": "Amazon Elastic Compute Cloud - Compute", "cost": "3.00"},
                {"key": "AWS Lambda", "cost": "0.10"},
            ],
        },
        {
            "start": "2026-09-08",
            "end": "2026-09-09",
            "groups": [
                {"key": "Amazon Elastic Compute Cloud - Compute", "cost": "3.50"},
                {"key": "Amazon DynamoDB", "cost": "0.05"},
            ],
        },
    ]

    with patch("app.graph.cost.get_cost_and_usage", return_value=fixture) as mock_get:
        totals = build_cost_by_resource_type(today=datetime.date(2026, 9, 9))

    assert totals == {"ec2": 6.5, "lambda": 0.1, "dynamodb": 0.05}
    mock_get.assert_called_once_with(
        start_date="2026-09-02",
        end_date="2026-09-09",
        granularity="DAILY",
        group_by="SERVICE",
        client=None,
    )


def test_build_cost_by_resource_type_ignores_unmapped_services():
    fixture = [
        {
            "start": "2026-09-08",
            "end": "2026-09-09",
            "groups": [{"key": "Amazon Simple Storage Service", "cost": "1.00"}],
        }
    ]

    with patch("app.graph.cost.get_cost_and_usage", return_value=fixture):
        totals = build_cost_by_resource_type(today=datetime.date(2026, 9, 9))

    assert totals == {}
