import boto3


def get_cost_and_usage(
    start_date: str,
    end_date: str,
    granularity: str = "DAILY",
    group_by: str | None = None,
    client=None,
) -> list[dict]:
    client = client or boto3.client("ce")
    kwargs = {
        "TimePeriod": {"Start": start_date, "End": end_date},
        "Granularity": granularity,
        "Metrics": ["UnblendedCost"],
    }
    if group_by:
        kwargs["GroupBy"] = [{"Type": "DIMENSION", "Key": group_by}]

    response = client.get_cost_and_usage(**kwargs)

    results = []
    for period in response["ResultsByTime"]:
        entry = {"start": period["TimePeriod"]["Start"], "end": period["TimePeriod"]["End"]}
        if period.get("Groups"):
            entry["groups"] = [
                {"key": g["Keys"][0], "cost": g["Metrics"]["UnblendedCost"]["Amount"]}
                for g in period["Groups"]
            ]
        else:
            entry["cost"] = period["Total"]["UnblendedCost"]["Amount"]
        results.append(entry)
    return results
