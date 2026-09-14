import datetime

from app.tools.cloudwatch import get_cloudwatch_metric

METRIC_CONFIG = {
    "ec2": {
        "namespace": "AWS/EC2",
        "metric_name": "CPUUtilization",
        "dimension_name": "InstanceId",
        "stat": "Average",
    },
    "lambda": {
        "namespace": "AWS/Lambda",
        "metric_name": "Duration",
        "dimension_name": "FunctionName",
        "stat": "Average",
    },
    "dynamodb": {
        "namespace": "AWS/DynamoDB",
        "metric_name": "ConsumedReadCapacityUnits",
        "dimension_name": "TableName",
        "stat": "Sum",
    },
}


def latest_metric_snapshot(datapoints: list[dict]) -> dict | None:
    if not datapoints:
        return None
    return datapoints[-1]


def get_metric_snapshot(
    resource_type: str,
    resource_id: str,
    client=None,
    now: datetime.datetime | None = None,
) -> dict | None:
    config = METRIC_CONFIG[resource_type]
    now = now or datetime.datetime.utcnow()

    datapoints = get_cloudwatch_metric(
        namespace=config["namespace"],
        metric_name=config["metric_name"],
        dimensions={config["dimension_name"]: resource_id},
        start_time=now - datetime.timedelta(hours=1),
        end_time=now,
        stat=config["stat"],
        client=client,
    )
    return latest_metric_snapshot(datapoints)
