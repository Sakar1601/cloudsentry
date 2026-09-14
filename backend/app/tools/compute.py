import boto3


def list_ec2_instances(filters: list[dict] | None = None, client=None) -> list[dict]:
    client = client or boto3.client("ec2")
    kwargs = {"Filters": filters} if filters else {}
    response = client.describe_instances(**kwargs)

    instances = []
    for reservation in response["Reservations"]:
        for inst in reservation["Instances"]:
            instances.append(
                {
                    "instance_id": inst["InstanceId"],
                    "state": inst["State"]["Name"],
                    "instance_type": inst["InstanceType"],
                    "launch_time": inst["LaunchTime"].isoformat(),
                    "tags": {t["Key"]: t["Value"] for t in inst.get("Tags", [])},
                    "vpc_id": inst.get("VpcId"),
                }
            )
    return instances


def list_lambda_functions(client=None) -> list[dict]:
    client = client or boto3.client("lambda")
    response = client.list_functions()
    return [
        {
            "function_name": fn["FunctionName"],
            "runtime": fn.get("Runtime"),
            "memory_size": fn["MemorySize"],
            "timeout": fn["Timeout"],
            "role_arn": fn["Role"],
            "environment": fn.get("Environment", {}).get("Variables", {}),
        }
        for fn in response["Functions"]
    ]
