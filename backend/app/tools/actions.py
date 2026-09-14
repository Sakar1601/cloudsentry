import json

import boto3


def stop_ec2_instance(instance_id: str, client=None) -> dict:
    client = client or boto3.client("ec2")
    client.stop_instances(InstanceIds=[instance_id])
    return {"instance_id": instance_id, "action": "stop"}


def resize_ec2_instance(instance_id: str, new_instance_type: str, client=None) -> dict:
    client = client or boto3.client("ec2")
    client.modify_instance_attribute(
        InstanceId=instance_id, InstanceType={"Value": new_instance_type}
    )
    return {"instance_id": instance_id, "new_instance_type": new_instance_type, "action": "resize"}


def tighten_iam_policy(
    role_name: str, policy_name: str, new_policy_document: dict, client=None
) -> dict:
    client = client or boto3.client("iam")
    client.put_role_policy(
        RoleName=role_name,
        PolicyName=policy_name,
        PolicyDocument=json.dumps(new_policy_document),
    )
    return {"role_name": role_name, "policy_name": policy_name, "action": "tighten_iam_policy"}
