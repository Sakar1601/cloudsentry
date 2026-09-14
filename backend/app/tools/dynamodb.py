import boto3


def list_dynamodb_tables(client=None) -> list[dict]:
    client = client or boto3.client("dynamodb")
    table_names = client.list_tables()["TableNames"]

    tables = []
    for name in table_names:
        table = client.describe_table(TableName=name)["Table"]
        tables.append(
            {
                "table_name": table["TableName"],
                "table_arn": table["TableArn"],
                "status": table["TableStatus"],
                "item_count": table.get("ItemCount", 0),
                "table_size_bytes": table.get("TableSizeBytes", 0),
                "billing_mode": table.get("BillingModeSummary", {}).get(
                    "BillingMode", "PROVISIONED"
                ),
            }
        )
    return tables
