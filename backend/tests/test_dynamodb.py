from unittest.mock import MagicMock

from app.tools.dynamodb import list_dynamodb_tables


def test_list_dynamodb_tables_describes_each_table():
    mock_client = MagicMock()
    mock_client.list_tables.return_value = {"TableNames": ["orders"]}
    mock_client.describe_table.return_value = {
        "Table": {
            "TableName": "orders",
            "TableArn": "arn:aws:dynamodb:us-east-1:123456789012:table/orders",
            "TableStatus": "ACTIVE",
            "ItemCount": 42,
            "TableSizeBytes": 10240,
            "BillingModeSummary": {"BillingMode": "PAY_PER_REQUEST"},
        }
    }

    tables = list_dynamodb_tables(client=mock_client)

    assert tables == [
        {
            "table_name": "orders",
            "table_arn": "arn:aws:dynamodb:us-east-1:123456789012:table/orders",
            "status": "ACTIVE",
            "item_count": 42,
            "table_size_bytes": 10240,
            "billing_mode": "PAY_PER_REQUEST",
        }
    ]
    mock_client.describe_table.assert_called_once_with(TableName="orders")


def test_list_dynamodb_tables_defaults_missing_fields():
    mock_client = MagicMock()
    mock_client.list_tables.return_value = {"TableNames": ["legacy"]}
    mock_client.describe_table.return_value = {
        "Table": {
            "TableName": "legacy",
            "TableArn": "arn:aws:dynamodb:us-east-1:123456789012:table/legacy",
            "TableStatus": "ACTIVE",
        }
    }

    tables = list_dynamodb_tables(client=mock_client)

    assert tables[0]["item_count"] == 0
    assert tables[0]["table_size_bytes"] == 0
    assert tables[0]["billing_mode"] == "PROVISIONED"


def test_list_dynamodb_tables_returns_empty_list_when_no_tables():
    mock_client = MagicMock()
    mock_client.list_tables.return_value = {"TableNames": []}

    tables = list_dynamodb_tables(client=mock_client)

    assert tables == []
    mock_client.describe_table.assert_not_called()
