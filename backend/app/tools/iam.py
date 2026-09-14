import boto3


def get_iam_policy_for_role(role_name: str, client=None) -> dict:
    client = client or boto3.client("iam")

    attached_response = client.list_attached_role_policies(RoleName=role_name)
    attached_policies = []
    for policy in attached_response["AttachedPolicies"]:
        version_id = client.get_policy(PolicyArn=policy["PolicyArn"])["Policy"]["DefaultVersionId"]
        document = client.get_policy_version(
            PolicyArn=policy["PolicyArn"], VersionId=version_id
        )["PolicyVersion"]["Document"]
        attached_policies.append(
            {
                "policy_name": policy["PolicyName"],
                "policy_arn": policy["PolicyArn"],
                "document": document,
            }
        )

    inline_names = client.list_role_policies(RoleName=role_name)["PolicyNames"]
    inline_policies = []
    for name in inline_names:
        document = client.get_role_policy(RoleName=role_name, PolicyName=name)["PolicyDocument"]
        inline_policies.append({"policy_name": name, "document": document})

    return {
        "role_name": role_name,
        "attached_policies": attached_policies,
        "inline_policies": inline_policies,
    }
