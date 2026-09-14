import time

import boto3


def get_cloudwatch_logs(
    log_group: str,
    query: str,
    start_time: int,
    end_time: int,
    client=None,
) -> list[dict]:
    client = client or boto3.client("logs")
    started = client.start_query(
        logGroupName=log_group,
        startTime=start_time,
        endTime=end_time,
        queryString=query,
    )
    query_id = started["queryId"]

    result = client.get_query_results(queryId=query_id)
    while result["status"] not in ("Complete", "Failed", "Cancelled"):
        time.sleep(1)
        result = client.get_query_results(queryId=query_id)

    if result["status"] != "Complete":
        raise RuntimeError(
            f"CloudWatch Logs Insights query {query_id} ended with status {result['status']}"
        )

    return [
        {field["field"]: field["value"] for field in record}
        for record in result["results"]
    ]


def get_cloudwatch_metric(
    namespace: str,
    metric_name: str,
    dimensions: dict,
    start_time,
    end_time,
    stat: str,
    client=None,
) -> list[dict]:
    client = client or boto3.client("cloudwatch")
    response = client.get_metric_statistics(
        Namespace=namespace,
        MetricName=metric_name,
        Dimensions=[{"Name": k, "Value": v} for k, v in dimensions.items()],
        StartTime=start_time,
        EndTime=end_time,
        Period=300,
        Statistics=[stat],
    )
    datapoints = sorted(response["Datapoints"], key=lambda dp: dp["Timestamp"])
    return [
        {"timestamp": dp["Timestamp"].isoformat(), "value": dp[stat]}
        for dp in datapoints
    ]
