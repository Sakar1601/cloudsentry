import datetime

from app.tools.cost_explorer import get_cost_and_usage

SERVICE_NAME_TO_RESOURCE_TYPE = {
    "Amazon Elastic Compute Cloud - Compute": "ec2",
    "AWS Lambda": "lambda",
    "Amazon DynamoDB": "dynamodb",
}


def build_cost_by_resource_type(
    client=None, today: datetime.date | None = None
) -> dict[str, float]:
    today = today or datetime.date.today()
    start = today - datetime.timedelta(days=7)

    results = get_cost_and_usage(
        start_date=start.isoformat(),
        end_date=today.isoformat(),
        granularity="DAILY",
        group_by="SERVICE",
        client=client,
    )

    totals: dict[str, float] = {}
    for period in results:
        for group in period.get("groups", []):
            resource_type = SERVICE_NAME_TO_RESOURCE_TYPE.get(group["key"])
            if resource_type is None:
                continue
            totals[resource_type] = totals.get(resource_type, 0.0) + float(group["cost"])
    return totals
