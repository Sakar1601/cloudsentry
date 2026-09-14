import datetime
from unittest.mock import MagicMock

from app.tools.compute import list_ec2_instances, list_lambda_functions


def test_list_ec2_instances_flattens_reservations():
    mock_client = MagicMock()
    mock_client.describe_instances.return_value = {
        "Reservations": [
            {
                "Instances": [
                    {
                        "InstanceId": "i-0123abc",
                        "State": {"Name": "running"},
                        "InstanceType": "t3.medium",
                        "LaunchTime": datetime.datetime(2026, 9, 9, 10, 0),
                        "Tags": [{"Key": "Name", "Value": "dev-box"}],
                        "VpcId": "vpc-1",
                    }
                ]
            }
        ]
    }

    instances = list_ec2_instances(client=mock_client)

    assert instances == [
        {
            "instance_id": "i-0123abc",
            "state": "running",
            "instance_type": "t3.medium",
            "launch_time": "2026-09-09T10:00:00",
            "tags": {"Name": "dev-box"},
            "vpc_id": "vpc-1",
        }
    ]
    mock_client.describe_instances.assert_called_once_with()


def test_list_ec2_instances_defaults_vpc_id_to_none_when_absent():
    mock_client = MagicMock()
    mock_client.describe_instances.return_value = {
        "Reservations": [
            {
                "Instances": [
                    {
                        "InstanceId": "i-9",
                        "State": {"Name": "running"},
                        "InstanceType": "t3.micro",
                        "LaunchTime": datetime.datetime(2026, 9, 9, 10, 0),
                        "Tags": [],
                    }
                ]
            }
        ]
    }

    instances = list_ec2_instances(client=mock_client)

    assert instances[0]["vpc_id"] is None


def test_list_ec2_instances_passes_filters():
    mock_client = MagicMock()
    mock_client.describe_instances.return_value = {"Reservations": []}

    list_ec2_instances(filters=[{"Name": "instance-state-name", "Values": ["running"]}], client=mock_client)

    mock_client.describe_instances.assert_called_once_with(
        Filters=[{"Name": "instance-state-name", "Values": ["running"]}]
    )


def test_list_lambda_functions_returns_parsed_functions():
    mock_client = MagicMock()
    mock_client.list_functions.return_value = {
        "Functions": [
            {
                "FunctionName": "my-service",
                "Runtime": "python3.12",
                "MemorySize": 256,
                "Timeout": 30,
                "Role": "arn:aws:iam::123456789012:role/my-service-role",
                "Environment": {"Variables": {"TABLE_NAME": "orders"}},
            }
        ]
    }

    functions = list_lambda_functions(client=mock_client)

    assert functions == [
        {
            "function_name": "my-service",
            "runtime": "python3.12",
            "memory_size": 256,
            "timeout": 30,
            "role_arn": "arn:aws:iam::123456789012:role/my-service-role",
            "environment": {"TABLE_NAME": "orders"},
        }
    ]


def test_list_lambda_functions_defaults_environment_to_empty_dict():
    mock_client = MagicMock()
    mock_client.list_functions.return_value = {
        "Functions": [
            {
                "FunctionName": "no-env-fn",
                "Runtime": "python3.12",
                "MemorySize": 128,
                "Timeout": 3,
                "Role": "arn:aws:iam::123456789012:role/no-env-role",
            }
        ]
    }

    functions = list_lambda_functions(client=mock_client)

    assert functions[0]["environment"] == {}
