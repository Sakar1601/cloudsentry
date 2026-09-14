# Phase 1 — Static Graph Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a FastAPI `GET /graph` endpoint that polls live AWS (EC2, Lambda, DynamoDB, Cost Explorer, CloudWatch, IAM), assembles an in-memory graph of the account's resources and their relationships, and returns it as one JSON snapshot.

**Architecture:** A Python backend (`backend/app/`) with one module per AWS service area under `app/tools/` (unchanged pattern: thin, individually-testable boto3 wrappers, each accepting an optional injected client). A new `app/graph/` package turns raw tool output into the node/edge model: `nodes.py` builds per-resource node dicts, `cost.py` aggregates 7-day cost per resource type, `metrics.py` attaches the latest CloudWatch datapoint per resource, `edges.py` derives relationships from static signals, and `builder.py` wires all of it into one `build_graph()` call. `app/main.py` exposes `GET /graph`, calling `build_graph()` synchronously on each request — no WebSocket, no agents, no traffic generator, no action tools; those are Phases 2–4.

**Tech Stack:** Python 3.11+, FastAPI, Pydantic, boto3, pytest, `unittest.mock` for boto3 client mocking, `httpx`/FastAPI `TestClient` for endpoint tests.

**Spec:** `docs/spec.md` (sections 4.1 AWS Tool Layer — read tools, 4.2 Graph Builder, 7 Phase 1)

## Global Constraints

- Read tools are always allowed, no approval needed (spec §4.1) — no gating logic belongs in this phase.
- Every AWS-touching function accepts an optional injected client (`client=None`, defaulting to `boto3.client(...)`) so tests can pass a mock without patching global state.
- No test may make a real AWS call — every AWS-touching function is tested with a mocked boto3 client.
- Node identity must be stable across polls: node ids are derived from the resource's own AWS id/name (spec §4.2), never regenerated per poll.
- Edges are derived from static signals only (spec §4.2, §3 non-goals): same-VPC membership (EC2), Lambda environment variables referencing a table, and IAM policy access grants. No distributed tracing, no live traffic-derived edges — that's out of scope for Phase 1 and beyond.
- Out of scope for this phase: action tools (`stop_ec2_instance`, `resize_ec2_instance`, `tighten_iam_policy`), `WS /graph/stream`, the agent swarm, the Traffic Generator, and the Action/Approval subsystem — all Phase 2+.

## Design Notes (Phase 1 scoping decisions)

These are deliberate simplifications within the spec's intent, not gaps — documented here so later phases know what to revisit:

- **`cost_7d` is a per-resource-type approximation, not per-instance billing.** AWS Cost Explorer's `GetCostAndUsage` cannot attribute cost to an individual EC2 instance or Lambda function without resource-level cost allocation tags (a separate, more limited API). Phase 1 computes trailing 7-day cost grouped by AWS service (`SERVICE` dimension) and applies the same total to every node of that resource type. Revisit if per-resource cost becomes a requirement later.
- **IAM-based edges cover Lambda only, not EC2.** A Lambda function's execution role ARN is available directly from `list_functions`. An EC2 instance only exposes an *instance profile* ARN, which requires a separate `iam:get_instance_profile` call to resolve to a role — deferred as unnecessary complexity for Phase 1.
- **No API-Gateway-to-Lambda "invoke target" edges yet.** API Gateway isn't part of the Phase 1 AWS Tool Layer (spec §4.1 lists EC2, Lambda, DynamoDB, Cost Explorer, CloudWatch, IAM only), so that edge type isn't derivable yet. Deferred to whichever phase adds an API Gateway read tool.
- **Duplicate edges between the same two nodes are allowed.** A Lambda function can get both a `references` edge (env var match) and an `iam_access` edge (policy match) to the same DynamoDB table — these are semantically different relationships and Phase 1 does not deduplicate them.

---

## File Structure

- `backend/pyproject.toml` — project metadata + dependencies (fastapi, uvicorn, boto3, pydantic, pytest, httpx).
- `backend/app/__init__.py` — empty package marker.
- `backend/app/main.py` — FastAPI app: `GET /health`, `GET /graph`.
- `backend/app/tools/__init__.py` — empty package marker.
- `backend/app/tools/cloudwatch.py` — `get_cloudwatch_logs`, `get_cloudwatch_metric`.
- `backend/app/tools/cost_explorer.py` — `get_cost_and_usage`.
- `backend/app/tools/compute.py` — `list_ec2_instances`, `list_lambda_functions`.
- `backend/app/tools/dynamodb.py` — `list_dynamodb_tables`.
- `backend/app/tools/iam.py` — `get_iam_policy_for_role`.
- `backend/app/graph/__init__.py` — empty package marker.
- `backend/app/graph/nodes.py` — node id helpers + `build_ec2_node`, `build_lambda_node`, `build_dynamodb_node`.
- `backend/app/graph/cost.py` — `build_cost_by_resource_type`.
- `backend/app/graph/metrics.py` — `latest_metric_snapshot`, `get_metric_snapshot`.
- `backend/app/graph/edges.py` — `same_vpc_edges`, `lambda_env_var_edges`, `iam_access_edges`.
- `backend/app/graph/builder.py` — `build_graph`.
- `backend/tests/test_cloudwatch.py`, `test_cost_explorer.py`, `test_compute.py`, `test_dynamodb.py`, `test_iam.py`, `test_nodes.py`, `test_cost.py`, `test_metrics.py`, `test_edges.py`, `test_builder.py`, `test_main.py` — one test file per module above.

---

## Task 1: Backend project scaffolding

**Files:**
- Create: `backend/pyproject.toml`
- Create: `backend/app/__init__.py`
- Create: `backend/app/main.py`
- Test: `backend/tests/test_main.py`

**Interfaces:**
- Produces: FastAPI `app` instance importable as `from app.main import app`; `GET /health` returning `{"status": "ok"}`.

- [ ] **Step 1: Write `backend/pyproject.toml`**

```toml
[project]
name = "cloudsentry-backend"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = [
    "fastapi>=0.110",
    "uvicorn>=0.29",
    "boto3>=1.34",
    "pydantic>=2.6",
]

[project.optional-dependencies]
dev = [
    "pytest>=8.0",
    "httpx>=0.27",
]

[tool.pytest.ini_options]
pythonpath = ["."]
```

- [ ] **Step 2: Create `backend/app/__init__.py`** (empty file)

- [ ] **Step 3: Write the failing test** in `backend/tests/test_main.py`

```python
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_returns_ok():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
```

- [ ] **Step 4: Run test to verify it fails**

Run (from `backend/`): `pip install -e ".[dev]" && pytest tests/test_main.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.main'`.

- [ ] **Step 5: Write minimal implementation** in `backend/app/main.py`

```python
from fastapi import FastAPI

app = FastAPI(title="Cloudsentry Graph API")


@app.get("/health")
def health():
    return {"status": "ok"}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pytest tests/test_main.py -v`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add backend/pyproject.toml backend/app/__init__.py backend/app/main.py backend/tests/test_main.py
git commit -m "chore: scaffold FastAPI backend with health endpoint"
```

---

## Task 2: CloudWatch tools (`get_cloudwatch_logs`, `get_cloudwatch_metric`)

**Files:**
- Create: `backend/app/tools/__init__.py`
- Create: `backend/app/tools/cloudwatch.py`
- Test: `backend/tests/test_cloudwatch.py`

**Interfaces:**
- Produces: `get_cloudwatch_logs(log_group: str, query: str, start_time: int, end_time: int, client=None) -> list[dict]`
- Produces: `get_cloudwatch_metric(namespace: str, metric_name: str, dimensions: dict, start_time, end_time, stat: str, client=None) -> list[dict]` — each item shaped `{"timestamp": str, "value": float}`, sorted ascending by timestamp.

- [ ] **Step 1: Create `backend/app/tools/__init__.py`** (empty file)

- [ ] **Step 2: Write the failing tests** in `backend/tests/test_cloudwatch.py`

```python
from unittest.mock import MagicMock, patch

from app.tools.cloudwatch import get_cloudwatch_logs, get_cloudwatch_metric


def test_get_cloudwatch_logs_returns_parsed_records():
    mock_client = MagicMock()
    mock_client.start_query.return_value = {"queryId": "q-1"}
    mock_client.get_query_results.return_value = {
        "status": "Complete",
        "results": [
            [
                {"field": "@timestamp", "value": "2026-09-09 23:40:00.000"},
                {"field": "@message", "value": "ProvisionedThroughputExceededException"},
            ]
        ],
    }

    with patch("app.tools.cloudwatch.time.sleep"):
        records = get_cloudwatch_logs(
            log_group="/aws/lambda/my-service",
            query="fields @timestamp, @message",
            start_time=1,
            end_time=2,
            client=mock_client,
        )

    assert records == [
        {
            "@timestamp": "2026-09-09 23:40:00.000",
            "@message": "ProvisionedThroughputExceededException",
        }
    ]
    mock_client.start_query.assert_called_once_with(
        logGroupName="/aws/lambda/my-service",
        startTime=1,
        endTime=2,
        queryString="fields @timestamp, @message",
    )


def test_get_cloudwatch_logs_polls_until_complete():
    mock_client = MagicMock()
    mock_client.start_query.return_value = {"queryId": "q-2"}
    mock_client.get_query_results.side_effect = [
        {"status": "Running", "results": []},
        {"status": "Complete", "results": []},
    ]

    with patch("app.tools.cloudwatch.time.sleep"):
        records = get_cloudwatch_logs(
            log_group="/aws/lambda/my-service",
            query="fields @timestamp",
            start_time=1,
            end_time=2,
            client=mock_client,
        )

    assert records == []
    assert mock_client.get_query_results.call_count == 2


def test_get_cloudwatch_logs_raises_on_failed_query():
    mock_client = MagicMock()
    mock_client.start_query.return_value = {"queryId": "q-3"}
    mock_client.get_query_results.return_value = {"status": "Failed", "results": []}

    with patch("app.tools.cloudwatch.time.sleep"):
        try:
            get_cloudwatch_logs(
                log_group="/aws/lambda/my-service",
                query="fields @timestamp",
                start_time=1,
                end_time=2,
                client=mock_client,
            )
            assert False, "expected RuntimeError"
        except RuntimeError as e:
            assert "q-3" in str(e)


def test_get_cloudwatch_metric_returns_sorted_datapoints():
    import datetime

    mock_client = MagicMock()
    mock_client.get_metric_statistics.return_value = {
        "Datapoints": [
            {"Timestamp": datetime.datetime(2026, 9, 9, 23, 50), "Average": 200.0},
            {"Timestamp": datetime.datetime(2026, 9, 9, 23, 40), "Average": 120.0},
        ]
    }

    points = get_cloudwatch_metric(
        namespace="AWS/Lambda",
        metric_name="Duration",
        dimensions={"FunctionName": "my-service"},
        start_time=datetime.datetime(2026, 9, 9, 23, 0),
        end_time=datetime.datetime(2026, 9, 10, 0, 0),
        stat="Average",
        client=mock_client,
    )

    assert points == [
        {"timestamp": "2026-09-09T23:40:00", "value": 120.0},
        {"timestamp": "2026-09-09T23:50:00", "value": 200.0},
    ]
    call_kwargs = mock_client.get_metric_statistics.call_args.kwargs
    assert call_kwargs["Dimensions"] == [{"Name": "FunctionName", "Value": "my-service"}]
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pytest tests/test_cloudwatch.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.tools.cloudwatch'`

- [ ] **Step 4: Write minimal implementation** in `backend/app/tools/cloudwatch.py`

```python
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
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pytest tests/test_cloudwatch.py -v`
Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
git add backend/app/tools/__init__.py backend/app/tools/cloudwatch.py backend/tests/test_cloudwatch.py
git commit -m "feat: add CloudWatch Logs and metrics read tools"
```

---

## Task 3: Cost Explorer tool (`get_cost_and_usage`)

**Files:**
- Create: `backend/app/tools/cost_explorer.py`
- Test: `backend/tests/test_cost_explorer.py`

**Interfaces:**
- Produces: `get_cost_and_usage(start_date: str, end_date: str, granularity: str = "DAILY", group_by: str | None = None, client=None) -> list[dict]` — each item shaped `{"start": str, "end": str, "cost": str}` or, when `group_by` is set, `{"start": str, "end": str, "groups": [{"key": str, "cost": str}]}`.

- [ ] **Step 1: Write the failing tests** in `backend/tests/test_cost_explorer.py`

```python
from unittest.mock import MagicMock

from app.tools.cost_explorer import get_cost_and_usage


def test_get_cost_and_usage_without_group_by():
    mock_client = MagicMock()
    mock_client.get_cost_and_usage.return_value = {
        "ResultsByTime": [
            {
                "TimePeriod": {"Start": "2026-09-01", "End": "2026-09-02"},
                "Total": {"UnblendedCost": {"Amount": "12.34", "Unit": "USD"}},
                "Groups": [],
            }
        ]
    }

    result = get_cost_and_usage(
        start_date="2026-09-01",
        end_date="2026-09-02",
        granularity="DAILY",
        client=mock_client,
    )

    assert result == [{"start": "2026-09-01", "end": "2026-09-02", "cost": "12.34"}]
    mock_client.get_cost_and_usage.assert_called_once_with(
        TimePeriod={"Start": "2026-09-01", "End": "2026-09-02"},
        Granularity="DAILY",
        Metrics=["UnblendedCost"],
    )


def test_get_cost_and_usage_with_group_by():
    mock_client = MagicMock()
    mock_client.get_cost_and_usage.return_value = {
        "ResultsByTime": [
            {
                "TimePeriod": {"Start": "2026-09-01", "End": "2026-09-02"},
                "Total": {},
                "Groups": [
                    {
                        "Keys": ["Amazon Elastic Compute Cloud - Compute"],
                        "Metrics": {"UnblendedCost": {"Amount": "9.00", "Unit": "USD"}},
                    }
                ],
            }
        ]
    }

    result = get_cost_and_usage(
        start_date="2026-09-01",
        end_date="2026-09-02",
        granularity="DAILY",
        group_by="SERVICE",
        client=mock_client,
    )

    assert result == [
        {
            "start": "2026-09-01",
            "end": "2026-09-02",
            "groups": [
                {"key": "Amazon Elastic Compute Cloud - Compute", "cost": "9.00"}
            ],
        }
    ]
    call_kwargs = mock_client.get_cost_and_usage.call_args.kwargs
    assert call_kwargs["GroupBy"] == [{"Type": "DIMENSION", "Key": "SERVICE"}]
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_cost_explorer.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.tools.cost_explorer'`

- [ ] **Step 3: Write minimal implementation** in `backend/app/tools/cost_explorer.py`

```python
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_cost_explorer.py -v`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/app/tools/cost_explorer.py backend/tests/test_cost_explorer.py
git commit -m "feat: add Cost Explorer read tool"
```

---

## Task 4: Compute tools (`list_ec2_instances`, `list_lambda_functions`)

**Files:**
- Create: `backend/app/tools/compute.py`
- Test: `backend/tests/test_compute.py`

**Interfaces:**
- Produces: `list_ec2_instances(filters: list[dict] | None = None, client=None) -> list[dict]` — each item shaped `{"instance_id": str, "state": str, "instance_type": str, "launch_time": str, "tags": dict, "vpc_id": str | None}`.
- Produces: `list_lambda_functions(client=None) -> list[dict]` — each item shaped `{"function_name": str, "runtime": str | None, "memory_size": int, "timeout": int, "role_arn": str, "environment": dict}`.

- [ ] **Step 1: Write the failing tests** in `backend/tests/test_compute.py`

```python
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_compute.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.tools.compute'`

- [ ] **Step 3: Write minimal implementation** in `backend/app/tools/compute.py`

```python
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_compute.py -v`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/app/tools/compute.py backend/tests/test_compute.py
git commit -m "feat: add EC2 and Lambda list read tools"
```

---

## Task 5: DynamoDB tool (`list_dynamodb_tables`)

**Files:**
- Create: `backend/app/tools/dynamodb.py`
- Test: `backend/tests/test_dynamodb.py`

**Interfaces:**
- Produces: `list_dynamodb_tables(client=None) -> list[dict]` — each item shaped `{"table_name": str, "table_arn": str, "status": str, "item_count": int, "table_size_bytes": int, "billing_mode": str}`.

- [ ] **Step 1: Write the failing tests** in `backend/tests/test_dynamodb.py`

```python
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_dynamodb.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.tools.dynamodb'`

- [ ] **Step 3: Write minimal implementation** in `backend/app/tools/dynamodb.py`

```python
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_dynamodb.py -v`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/app/tools/dynamodb.py backend/tests/test_dynamodb.py
git commit -m "feat: add DynamoDB list read tool"
```

---

## Task 6: IAM tool (`get_iam_policy_for_role`)

**Files:**
- Create: `backend/app/tools/iam.py`
- Test: `backend/tests/test_iam.py`

**Interfaces:**
- Produces: `get_iam_policy_for_role(role_name: str, client=None) -> dict` with shape `{"role_name": str, "attached_policies": list[dict], "inline_policies": list[dict]}`, where each policy entry has a `"document"` key holding the raw IAM policy document.

- [ ] **Step 1: Write the failing test** in `backend/tests/test_iam.py`

```python
from unittest.mock import MagicMock

from app.tools.iam import get_iam_policy_for_role


def test_get_iam_policy_for_role_returns_attached_and_inline():
    mock_client = MagicMock()
    mock_client.list_attached_role_policies.return_value = {
        "AttachedPolicies": [
            {"PolicyName": "AmazonS3ReadOnlyAccess", "PolicyArn": "arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess"}
        ]
    }
    mock_client.get_policy.return_value = {"Policy": {"DefaultVersionId": "v1"}}
    mock_client.get_policy_version.return_value = {
        "PolicyVersion": {"Document": {"Statement": [{"Effect": "Allow", "Action": "s3:Get*"}]}}
    }
    mock_client.list_role_policies.return_value = {"PolicyNames": ["InlineAdminAccess"]}
    mock_client.get_role_policy.return_value = {
        "PolicyDocument": {"Statement": [{"Effect": "Allow", "Action": "*"}]}
    }

    result = get_iam_policy_for_role("my-role", client=mock_client)

    assert result == {
        "role_name": "my-role",
        "attached_policies": [
            {
                "policy_name": "AmazonS3ReadOnlyAccess",
                "policy_arn": "arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess",
                "document": {"Statement": [{"Effect": "Allow", "Action": "s3:Get*"}]},
            }
        ],
        "inline_policies": [
            {
                "policy_name": "InlineAdminAccess",
                "document": {"Statement": [{"Effect": "Allow", "Action": "*"}]},
            }
        ],
    }
    mock_client.list_attached_role_policies.assert_called_once_with(RoleName="my-role")
    mock_client.list_role_policies.assert_called_once_with(RoleName="my-role")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_iam.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.tools.iam'`

- [ ] **Step 3: Write minimal implementation** in `backend/app/tools/iam.py`

```python
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_iam.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/tools/iam.py backend/tests/test_iam.py
git commit -m "feat: add IAM role policy read tool"
```

---

## Task 7: Graph node builders

**Files:**
- Create: `backend/app/graph/__init__.py`
- Create: `backend/app/graph/nodes.py`
- Test: `backend/tests/test_nodes.py`

**Interfaces:**
- Consumes: item shapes produced by `list_ec2_instances`, `list_lambda_functions`, `list_dynamodb_tables` (Tasks 4–5).
- Produces: `ec2_node_id(instance_id: str) -> str`, `lambda_node_id(function_name: str) -> str`, `dynamodb_node_id(table_name: str) -> str`; `build_ec2_node(instance: dict) -> dict`, `build_lambda_node(function: dict) -> dict`, `build_dynamodb_node(table: dict) -> dict` — each returns `{"node_id": str, "resource_type": str, "name": str, "state": str, "tags": dict, "cost_7d": None, "last_metric_snapshot": None}` (the last two fields are filled in later by the builder — see Task 11).

- [ ] **Step 1: Create `backend/app/graph/__init__.py`** (empty file)

- [ ] **Step 2: Write the failing tests** in `backend/tests/test_nodes.py`

```python
from app.graph.nodes import (
    build_dynamodb_node,
    build_ec2_node,
    build_lambda_node,
    dynamodb_node_id,
    ec2_node_id,
    lambda_node_id,
)


def test_ec2_node_id_is_prefixed_and_stable():
    assert ec2_node_id("i-0123abc") == "ec2:i-0123abc"
    assert ec2_node_id("i-0123abc") == ec2_node_id("i-0123abc")


def test_lambda_node_id_is_prefixed():
    assert lambda_node_id("my-service") == "lambda:my-service"


def test_dynamodb_node_id_is_prefixed():
    assert dynamodb_node_id("orders") == "dynamodb:orders"


def test_build_ec2_node_uses_name_tag_when_present():
    instance = {
        "instance_id": "i-1",
        "state": "running",
        "instance_type": "t3.micro",
        "launch_time": "2026-09-09T10:00:00",
        "tags": {"Name": "dev-box"},
        "vpc_id": "vpc-1",
    }

    node = build_ec2_node(instance)

    assert node == {
        "node_id": "ec2:i-1",
        "resource_type": "ec2",
        "name": "dev-box",
        "state": "running",
        "tags": {"Name": "dev-box"},
        "cost_7d": None,
        "last_metric_snapshot": None,
    }


def test_build_ec2_node_falls_back_to_instance_id_when_no_name_tag():
    instance = {
        "instance_id": "i-2",
        "state": "running",
        "instance_type": "t3.micro",
        "launch_time": "2026-09-09T10:00:00",
        "tags": {},
        "vpc_id": None,
    }

    node = build_ec2_node(instance)

    assert node["name"] == "i-2"


def test_build_lambda_node():
    function = {
        "function_name": "my-service",
        "runtime": "python3.12",
        "memory_size": 128,
        "timeout": 10,
        "role_arn": "arn:aws:iam::123456789012:role/my-service-role",
        "environment": {"TABLE_NAME": "orders"},
    }

    node = build_lambda_node(function)

    assert node == {
        "node_id": "lambda:my-service",
        "resource_type": "lambda",
        "name": "my-service",
        "state": "active",
        "tags": {},
        "cost_7d": None,
        "last_metric_snapshot": None,
    }


def test_build_dynamodb_node():
    table = {
        "table_name": "orders",
        "table_arn": "arn:aws:dynamodb:us-east-1:123456789012:table/orders",
        "status": "ACTIVE",
        "item_count": 5,
        "table_size_bytes": 1024,
        "billing_mode": "PAY_PER_REQUEST",
    }

    node = build_dynamodb_node(table)

    assert node == {
        "node_id": "dynamodb:orders",
        "resource_type": "dynamodb",
        "name": "orders",
        "state": "ACTIVE",
        "tags": {},
        "cost_7d": None,
        "last_metric_snapshot": None,
    }
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pytest tests/test_nodes.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.graph.nodes'`

- [ ] **Step 4: Write minimal implementation** in `backend/app/graph/nodes.py`

```python
def ec2_node_id(instance_id: str) -> str:
    return f"ec2:{instance_id}"


def lambda_node_id(function_name: str) -> str:
    return f"lambda:{function_name}"


def dynamodb_node_id(table_name: str) -> str:
    return f"dynamodb:{table_name}"


def build_ec2_node(instance: dict) -> dict:
    return {
        "node_id": ec2_node_id(instance["instance_id"]),
        "resource_type": "ec2",
        "name": instance["tags"].get("Name", instance["instance_id"]),
        "state": instance["state"],
        "tags": instance["tags"],
        "cost_7d": None,
        "last_metric_snapshot": None,
    }


def build_lambda_node(function: dict) -> dict:
    return {
        "node_id": lambda_node_id(function["function_name"]),
        "resource_type": "lambda",
        "name": function["function_name"],
        "state": "active",
        "tags": {},
        "cost_7d": None,
        "last_metric_snapshot": None,
    }


def build_dynamodb_node(table: dict) -> dict:
    return {
        "node_id": dynamodb_node_id(table["table_name"]),
        "resource_type": "dynamodb",
        "name": table["table_name"],
        "state": table["status"],
        "tags": {},
        "cost_7d": None,
        "last_metric_snapshot": None,
    }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pytest tests/test_nodes.py -v`
Expected: PASS (7 tests)

- [ ] **Step 6: Commit**

```bash
git add backend/app/graph/__init__.py backend/app/graph/nodes.py backend/tests/test_nodes.py
git commit -m "feat: add graph node id helpers and builders"
```

---

## Task 8: Cost aggregation (`build_cost_by_resource_type`)

**Files:**
- Create: `backend/app/graph/cost.py`
- Test: `backend/tests/test_cost.py`

**Interfaces:**
- Consumes: `get_cost_and_usage(start_date, end_date, granularity, group_by, client=None) -> list[dict]` (Task 3).
- Produces: `build_cost_by_resource_type(client=None, today: "datetime.date | None" = None) -> dict[str, float]` — keys are resource types (`"ec2"`, `"lambda"`, `"dynamodb"`), values are the summed 7-day `UnblendedCost` for that AWS service.

- [ ] **Step 1: Write the failing tests** in `backend/tests/test_cost.py`

```python
import datetime
from unittest.mock import patch

from app.graph.cost import build_cost_by_resource_type


def test_build_cost_by_resource_type_sums_known_services():
    fixture = [
        {
            "start": "2026-09-07",
            "end": "2026-09-08",
            "groups": [
                {"key": "Amazon Elastic Compute Cloud - Compute", "cost": "3.00"},
                {"key": "AWS Lambda", "cost": "0.10"},
            ],
        },
        {
            "start": "2026-09-08",
            "end": "2026-09-09",
            "groups": [
                {"key": "Amazon Elastic Compute Cloud - Compute", "cost": "3.50"},
                {"key": "Amazon DynamoDB", "cost": "0.05"},
            ],
        },
    ]

    with patch("app.graph.cost.get_cost_and_usage", return_value=fixture) as mock_get:
        totals = build_cost_by_resource_type(today=datetime.date(2026, 9, 9))

    assert totals == {"ec2": 6.5, "lambda": 0.1, "dynamodb": 0.05}
    mock_get.assert_called_once_with(
        start_date="2026-09-02",
        end_date="2026-09-09",
        granularity="DAILY",
        group_by="SERVICE",
        client=None,
    )


def test_build_cost_by_resource_type_ignores_unmapped_services():
    fixture = [
        {
            "start": "2026-09-08",
            "end": "2026-09-09",
            "groups": [{"key": "Amazon Simple Storage Service", "cost": "1.00"}],
        }
    ]

    with patch("app.graph.cost.get_cost_and_usage", return_value=fixture):
        totals = build_cost_by_resource_type(today=datetime.date(2026, 9, 9))

    assert totals == {}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_cost.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.graph.cost'`

- [ ] **Step 3: Write minimal implementation** in `backend/app/graph/cost.py`

```python
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_cost.py -v`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/app/graph/cost.py backend/tests/test_cost.py
git commit -m "feat: add per-resource-type cost aggregation"
```

---

## Task 9: Metric snapshots (`get_metric_snapshot`)

**Files:**
- Create: `backend/app/graph/metrics.py`
- Test: `backend/tests/test_metrics.py`

**Interfaces:**
- Consumes: `get_cloudwatch_metric(namespace, metric_name, dimensions, start_time, end_time, stat, client=None) -> list[dict]` (Task 2).
- Produces: `latest_metric_snapshot(datapoints: list[dict]) -> dict | None`; `get_metric_snapshot(resource_type: str, resource_id: str, client=None, now: "datetime.datetime | None" = None) -> dict | None`.

- [ ] **Step 1: Write the failing tests** in `backend/tests/test_metrics.py`

```python
import datetime
from unittest.mock import patch

from app.graph.metrics import get_metric_snapshot, latest_metric_snapshot


def test_latest_metric_snapshot_returns_last_point():
    datapoints = [
        {"timestamp": "2026-09-09T23:40:00", "value": 120.0},
        {"timestamp": "2026-09-09T23:50:00", "value": 200.0},
    ]

    assert latest_metric_snapshot(datapoints) == {
        "timestamp": "2026-09-09T23:50:00",
        "value": 200.0,
    }


def test_latest_metric_snapshot_returns_none_for_empty_list():
    assert latest_metric_snapshot([]) is None


def test_get_metric_snapshot_uses_ec2_metric_config():
    fixed_now = datetime.datetime(2026, 9, 9, 23, 0)

    with patch("app.graph.metrics.get_cloudwatch_metric") as mock_get_metric:
        mock_get_metric.return_value = [{"timestamp": "2026-09-09T22:55:00", "value": 40.0}]

        snapshot = get_metric_snapshot("ec2", "i-1", client="ec2-cw-client", now=fixed_now)

    assert snapshot == {"timestamp": "2026-09-09T22:55:00", "value": 40.0}
    mock_get_metric.assert_called_once_with(
        namespace="AWS/EC2",
        metric_name="CPUUtilization",
        dimensions={"InstanceId": "i-1"},
        start_time=fixed_now - datetime.timedelta(hours=1),
        end_time=fixed_now,
        stat="Average",
        client="ec2-cw-client",
    )


def test_get_metric_snapshot_uses_lambda_metric_config():
    fixed_now = datetime.datetime(2026, 9, 9, 23, 0)

    with patch("app.graph.metrics.get_cloudwatch_metric", return_value=[]) as mock_get_metric:
        get_metric_snapshot("lambda", "my-service", now=fixed_now)

    call_kwargs = mock_get_metric.call_args.kwargs
    assert call_kwargs["namespace"] == "AWS/Lambda"
    assert call_kwargs["metric_name"] == "Duration"
    assert call_kwargs["dimensions"] == {"FunctionName": "my-service"}


def test_get_metric_snapshot_uses_dynamodb_metric_config():
    fixed_now = datetime.datetime(2026, 9, 9, 23, 0)

    with patch("app.graph.metrics.get_cloudwatch_metric", return_value=[]) as mock_get_metric:
        get_metric_snapshot("dynamodb", "orders", now=fixed_now)

    call_kwargs = mock_get_metric.call_args.kwargs
    assert call_kwargs["namespace"] == "AWS/DynamoDB"
    assert call_kwargs["metric_name"] == "ConsumedReadCapacityUnits"
    assert call_kwargs["dimensions"] == {"TableName": "orders"}
    assert call_kwargs["stat"] == "Sum"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_metrics.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.graph.metrics'`

- [ ] **Step 3: Write minimal implementation** in `backend/app/graph/metrics.py`

```python
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_metrics.py -v`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/app/graph/metrics.py backend/tests/test_metrics.py
git commit -m "feat: add per-resource latest metric snapshot lookup"
```

---

## Task 10: Edge derivation

**Files:**
- Create: `backend/app/graph/edges.py`
- Test: `backend/tests/test_edges.py`

**Interfaces:**
- Consumes: item shapes from `list_ec2_instances`, `list_lambda_functions`, `list_dynamodb_tables` (Tasks 4–5); `ec2_node_id`, `lambda_node_id`, `dynamodb_node_id` (Task 7); `get_iam_policy_for_role` (Task 6).
- Produces: `same_vpc_edges(ec2_instances: list[dict]) -> list[dict]`, `lambda_env_var_edges(lambda_functions: list[dict], dynamodb_tables: list[dict]) -> list[dict]`, `iam_access_edges(lambda_functions: list[dict], dynamodb_tables: list[dict], client=None) -> list[dict]` — each returns a list of `{"source": str, "target": str, "relation": str}`.

- [ ] **Step 1: Write the failing tests** in `backend/tests/test_edges.py`

```python
from unittest.mock import patch

from app.graph.edges import (
    iam_access_edges,
    lambda_env_var_edges,
    same_vpc_edges,
)


def test_same_vpc_edges_links_instances_sharing_a_vpc():
    instances = [
        {"instance_id": "i-1", "vpc_id": "vpc-1"},
        {"instance_id": "i-2", "vpc_id": "vpc-1"},
        {"instance_id": "i-3", "vpc_id": "vpc-2"},
    ]

    edges = same_vpc_edges(instances)

    assert edges == [{"source": "ec2:i-1", "target": "ec2:i-2", "relation": "same_vpc"}]


def test_same_vpc_edges_ignores_instances_without_vpc():
    instances = [
        {"instance_id": "i-1", "vpc_id": None},
        {"instance_id": "i-2", "vpc_id": None},
    ]

    assert same_vpc_edges(instances) == []


def test_lambda_env_var_edges_matches_table_name_in_env_value():
    lambda_functions = [
        {"function_name": "my-service", "environment": {"TABLE_NAME": "orders"}}
    ]
    dynamodb_tables = [{"table_name": "orders", "table_arn": "arn:...:table/orders"}]

    edges = lambda_env_var_edges(lambda_functions, dynamodb_tables)

    assert edges == [
        {"source": "lambda:my-service", "target": "dynamodb:orders", "relation": "references"}
    ]


def test_lambda_env_var_edges_no_match_returns_empty():
    lambda_functions = [{"function_name": "my-service", "environment": {"LOG_LEVEL": "info"}}]
    dynamodb_tables = [{"table_name": "orders", "table_arn": "arn:...:table/orders"}]

    assert lambda_env_var_edges(lambda_functions, dynamodb_tables) == []


def test_iam_access_edges_matches_allow_statement_referencing_table_arn():
    lambda_functions = [
        {
            "function_name": "my-service",
            "role_arn": "arn:aws:iam::123456789012:role/my-service-role",
        }
    ]
    dynamodb_tables = [
        {"table_name": "orders", "table_arn": "arn:aws:dynamodb:us-east-1:123456789012:table/orders"}
    ]

    fake_policy = {
        "role_name": "my-service-role",
        "attached_policies": [
            {
                "policy_name": "OrdersAccess",
                "policy_arn": "arn:aws:iam::123456789012:policy/OrdersAccess",
                "document": {
                    "Statement": [
                        {
                            "Effect": "Allow",
                            "Action": "dynamodb:*",
                            "Resource": "arn:aws:dynamodb:us-east-1:123456789012:table/orders",
                        }
                    ]
                },
            }
        ],
        "inline_policies": [],
    }

    with patch("app.graph.edges.get_iam_policy_for_role", return_value=fake_policy) as mock_get_policy:
        edges = iam_access_edges(lambda_functions, dynamodb_tables)

    assert edges == [
        {"source": "lambda:my-service", "target": "dynamodb:orders", "relation": "iam_access"}
    ]
    mock_get_policy.assert_called_once_with("my-service-role", client=None)


def test_iam_access_edges_ignores_deny_statements():
    lambda_functions = [
        {"function_name": "my-service", "role_arn": "arn:aws:iam::123456789012:role/my-role"}
    ]
    dynamodb_tables = [
        {"table_name": "orders", "table_arn": "arn:aws:dynamodb:us-east-1:123456789012:table/orders"}
    ]
    fake_policy = {
        "role_name": "my-role",
        "attached_policies": [],
        "inline_policies": [
            {
                "policy_name": "DenyOrders",
                "document": {
                    "Statement": [
                        {
                            "Effect": "Deny",
                            "Action": "dynamodb:*",
                            "Resource": "arn:aws:dynamodb:us-east-1:123456789012:table/orders",
                        }
                    ]
                },
            }
        ],
    }

    with patch("app.graph.edges.get_iam_policy_for_role", return_value=fake_policy):
        edges = iam_access_edges(lambda_functions, dynamodb_tables)

    assert edges == []
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_edges.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.graph.edges'`

- [ ] **Step 3: Write minimal implementation** in `backend/app/graph/edges.py`

```python
from app.graph.nodes import dynamodb_node_id, ec2_node_id, lambda_node_id
from app.tools.iam import get_iam_policy_for_role


def same_vpc_edges(ec2_instances: list[dict]) -> list[dict]:
    by_vpc: dict[str, list[str]] = {}
    for instance in ec2_instances:
        vpc_id = instance.get("vpc_id")
        if not vpc_id:
            continue
        by_vpc.setdefault(vpc_id, []).append(instance["instance_id"])

    edges = []
    for instance_ids in by_vpc.values():
        for i in range(len(instance_ids)):
            for j in range(i + 1, len(instance_ids)):
                edges.append(
                    {
                        "source": ec2_node_id(instance_ids[i]),
                        "target": ec2_node_id(instance_ids[j]),
                        "relation": "same_vpc",
                    }
                )
    return edges


def lambda_env_var_edges(lambda_functions: list[dict], dynamodb_tables: list[dict]) -> list[dict]:
    table_names = [table["table_name"] for table in dynamodb_tables]

    edges = []
    for fn in lambda_functions:
        for value in fn.get("environment", {}).values():
            for table_name in table_names:
                if table_name in value:
                    edges.append(
                        {
                            "source": lambda_node_id(fn["function_name"]),
                            "target": dynamodb_node_id(table_name),
                            "relation": "references",
                        }
                    )
    return edges


def iam_access_edges(
    lambda_functions: list[dict], dynamodb_tables: list[dict], client=None
) -> list[dict]:
    edges = []
    for fn in lambda_functions:
        role_name = fn["role_arn"].rstrip("/").split("/")[-1]
        policy = get_iam_policy_for_role(role_name, client=client)
        all_policies = policy["attached_policies"] + policy["inline_policies"]

        for table in dynamodb_tables:
            if _policies_allow_resource(all_policies, table["table_arn"]):
                edges.append(
                    {
                        "source": lambda_node_id(fn["function_name"]),
                        "target": dynamodb_node_id(table["table_name"]),
                        "relation": "iam_access",
                    }
                )
    return edges


def _policies_allow_resource(policies: list[dict], arn: str) -> bool:
    for policy in policies:
        for statement in policy["document"].get("Statement", []):
            if statement.get("Effect") != "Allow":
                continue
            resource = statement.get("Resource", [])
            resources = resource if isinstance(resource, list) else [resource]
            if any(isinstance(r, str) and arn in r for r in resources):
                return True
    return False
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_edges.py -v`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/app/graph/edges.py backend/tests/test_edges.py
git commit -m "feat: add same-VPC, env-var-reference, and IAM-access edge derivation"
```

---

## Task 11: Graph builder (`build_graph`)

**Files:**
- Create: `backend/app/graph/builder.py`
- Test: `backend/tests/test_builder.py`

**Interfaces:**
- Consumes: `list_ec2_instances`, `list_lambda_functions` (Task 4), `list_dynamodb_tables` (Task 5), `build_ec2_node`/`build_lambda_node`/`build_dynamodb_node` (Task 7), `build_cost_by_resource_type` (Task 8), `get_metric_snapshot` (Task 9), `same_vpc_edges`/`lambda_env_var_edges`/`iam_access_edges` (Task 10).
- Produces: `build_graph(clients: dict | None = None) -> dict` — `{"nodes": dict[str, dict], "edges": list[dict]}`. `clients` maps service keys (`"ec2"`, `"lambda"`, `"dynamodb"`, `"ce"`, `"cloudwatch"`, `"iam"`) to boto3 clients; any missing key means the underlying tool falls back to `boto3.client(...)` itself.

- [ ] **Step 1: Write the failing test** in `backend/tests/test_builder.py`

```python
import datetime
from unittest.mock import MagicMock

from app.graph.builder import build_graph


def test_build_graph_wires_nodes_and_edges_from_real_boto3_shapes():
    ec2_client = MagicMock()
    ec2_client.describe_instances.return_value = {
        "Reservations": [
            {
                "Instances": [
                    {
                        "InstanceId": "i-1",
                        "State": {"Name": "running"},
                        "InstanceType": "t3.micro",
                        "LaunchTime": datetime.datetime(2026, 9, 9, 10, 0),
                        "Tags": [{"Key": "Name", "Value": "web"}],
                        "VpcId": "vpc-1",
                    }
                ]
            }
        ]
    }

    lambda_client = MagicMock()
    lambda_client.list_functions.return_value = {
        "Functions": [
            {
                "FunctionName": "my-service",
                "Runtime": "python3.12",
                "MemorySize": 128,
                "Timeout": 10,
                "Role": "arn:aws:iam::123456789012:role/my-service-role",
                "Environment": {"Variables": {"TABLE_NAME": "orders"}},
            }
        ]
    }

    dynamodb_client = MagicMock()
    dynamodb_client.list_tables.return_value = {"TableNames": ["orders"]}
    dynamodb_client.describe_table.return_value = {
        "Table": {
            "TableName": "orders",
            "TableArn": "arn:aws:dynamodb:us-east-1:123456789012:table/orders",
            "TableStatus": "ACTIVE",
            "ItemCount": 5,
            "TableSizeBytes": 1024,
            "BillingModeSummary": {"BillingMode": "PAY_PER_REQUEST"},
        }
    }

    ce_client = MagicMock()
    ce_client.get_cost_and_usage.return_value = {
        "ResultsByTime": [
            {
                "TimePeriod": {"Start": "2026-09-08", "End": "2026-09-09"},
                "Total": {},
                "Groups": [
                    {
                        "Keys": ["Amazon Elastic Compute Cloud - Compute"],
                        "Metrics": {"UnblendedCost": {"Amount": "3.50"}},
                    },
                    {
                        "Keys": ["AWS Lambda"],
                        "Metrics": {"UnblendedCost": {"Amount": "0.10"}},
                    },
                    {
                        "Keys": ["Amazon DynamoDB"],
                        "Metrics": {"UnblendedCost": {"Amount": "0.05"}},
                    },
                ],
            }
        ]
    }

    cloudwatch_client = MagicMock()
    cloudwatch_client.get_metric_statistics.return_value = {
        "Datapoints": [{"Timestamp": datetime.datetime(2026, 9, 9, 22, 55), "Average": 12.0, "Sum": 12.0}]
    }

    iam_client = MagicMock()
    iam_client.list_attached_role_policies.return_value = {
        "AttachedPolicies": [
            {
                "PolicyName": "OrdersAccess",
                "PolicyArn": "arn:aws:iam::123456789012:policy/OrdersAccess",
            }
        ]
    }
    iam_client.get_policy.return_value = {"Policy": {"DefaultVersionId": "v1"}}
    iam_client.get_policy_version.return_value = {
        "PolicyVersion": {
            "Document": {
                "Statement": [
                    {
                        "Effect": "Allow",
                        "Action": "dynamodb:*",
                        "Resource": "arn:aws:dynamodb:us-east-1:123456789012:table/orders",
                    }
                ]
            }
        }
    }
    iam_client.list_role_policies.return_value = {"PolicyNames": []}

    graph = build_graph(
        clients={
            "ec2": ec2_client,
            "lambda": lambda_client,
            "dynamodb": dynamodb_client,
            "ce": ce_client,
            "cloudwatch": cloudwatch_client,
            "iam": iam_client,
        }
    )

    assert set(graph["nodes"].keys()) == {"ec2:i-1", "lambda:my-service", "dynamodb:orders"}

    ec2_node = graph["nodes"]["ec2:i-1"]
    assert ec2_node["resource_type"] == "ec2"
    assert ec2_node["cost_7d"] == 3.5
    assert ec2_node["last_metric_snapshot"] == {"timestamp": "2026-09-09T22:55:00", "value": 12.0}

    lambda_node = graph["nodes"]["lambda:my-service"]
    assert lambda_node["cost_7d"] == 0.1

    dynamodb_node = graph["nodes"]["dynamodb:orders"]
    assert dynamodb_node["cost_7d"] == 0.05

    assert {
        "source": "lambda:my-service",
        "target": "dynamodb:orders",
        "relation": "references",
    } in graph["edges"]
    assert {
        "source": "lambda:my-service",
        "target": "dynamodb:orders",
        "relation": "iam_access",
    } in graph["edges"]
    assert not any(edge["relation"] == "same_vpc" for edge in graph["edges"])


def test_build_graph_defaults_to_empty_clients_dict():
    result = build_graph(clients={"ec2": MagicMock(describe_instances=MagicMock(return_value={"Reservations": []})),
                                   "lambda": MagicMock(list_functions=MagicMock(return_value={"Functions": []})),
                                   "dynamodb": MagicMock(list_tables=MagicMock(return_value={"TableNames": []})),
                                   "ce": MagicMock(get_cost_and_usage=MagicMock(return_value={"ResultsByTime": []})),
                                   "cloudwatch": MagicMock(),
                                   "iam": MagicMock()})

    assert result == {"nodes": {}, "edges": []}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_builder.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.graph.builder'`

- [ ] **Step 3: Write minimal implementation** in `backend/app/graph/builder.py`

```python
from app.graph.cost import build_cost_by_resource_type
from app.graph.edges import iam_access_edges, lambda_env_var_edges, same_vpc_edges
from app.graph.metrics import get_metric_snapshot
from app.graph.nodes import build_dynamodb_node, build_ec2_node, build_lambda_node
from app.tools.compute import list_ec2_instances, list_lambda_functions
from app.tools.dynamodb import list_dynamodb_tables


def build_graph(clients: dict | None = None) -> dict:
    clients = clients or {}

    ec2_instances = list_ec2_instances(client=clients.get("ec2"))
    lambda_functions = list_lambda_functions(client=clients.get("lambda"))
    dynamodb_tables = list_dynamodb_tables(client=clients.get("dynamodb"))

    cost_by_type = build_cost_by_resource_type(client=clients.get("ce"))

    nodes: dict[str, dict] = {}

    for instance in ec2_instances:
        node = build_ec2_node(instance)
        node["cost_7d"] = cost_by_type.get("ec2")
        node["last_metric_snapshot"] = get_metric_snapshot(
            "ec2", instance["instance_id"], client=clients.get("cloudwatch")
        )
        nodes[node["node_id"]] = node

    for function in lambda_functions:
        node = build_lambda_node(function)
        node["cost_7d"] = cost_by_type.get("lambda")
        node["last_metric_snapshot"] = get_metric_snapshot(
            "lambda", function["function_name"], client=clients.get("cloudwatch")
        )
        nodes[node["node_id"]] = node

    for table in dynamodb_tables:
        node = build_dynamodb_node(table)
        node["cost_7d"] = cost_by_type.get("dynamodb")
        node["last_metric_snapshot"] = get_metric_snapshot(
            "dynamodb", table["table_name"], client=clients.get("cloudwatch")
        )
        nodes[node["node_id"]] = node

    edges = (
        same_vpc_edges(ec2_instances)
        + lambda_env_var_edges(lambda_functions, dynamodb_tables)
        + iam_access_edges(lambda_functions, dynamodb_tables, client=clients.get("iam"))
    )

    return {"nodes": nodes, "edges": edges}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_builder.py -v`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/app/graph/builder.py backend/tests/test_builder.py
git commit -m "feat: wire tools, nodes, cost, metrics, and edges into build_graph"
```

---

## Task 12: `GET /graph` endpoint

**Files:**
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_main.py`

**Interfaces:**
- Consumes: `build_graph(clients=None) -> dict` (Task 11).
- Produces: `GET /graph` returning the JSON graph snapshot.

- [ ] **Step 1: Write the failing test** (append to `backend/tests/test_main.py`)

```python
from unittest.mock import patch


def test_get_graph_returns_builder_output():
    fake_graph = {
        "nodes": {"ec2:i-1": {"node_id": "ec2:i-1", "resource_type": "ec2"}},
        "edges": [],
    }

    with patch("app.main.build_graph", return_value=fake_graph):
        response = client.get("/graph")

    assert response.status_code == 200
    assert response.json() == fake_graph
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_main.py -v`
Expected: FAIL — `/graph` doesn't exist yet (404).

- [ ] **Step 3: Write minimal implementation** — replace the contents of `backend/app/main.py`

```python
from fastapi import FastAPI

from app.graph.builder import build_graph

app = FastAPI(title="Cloudsentry Graph API")


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/graph")
def get_graph():
    return build_graph()
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_main.py -v`
Expected: PASS (2 tests: `test_health_returns_ok`, `test_get_graph_returns_builder_output`)

- [ ] **Step 5: Commit**

```bash
git add backend/app/main.py backend/tests/test_main.py
git commit -m "feat: add GET /graph endpoint"
```

---

## Task 13: Full-suite verification + manual curl smoke test

**Files:** none created; this task verifies the assembled system.

- [ ] **Step 1: Run the full backend test suite**

Run (from `backend/`): `pytest -v`
Expected: All tests across every module in this plan PASS.

- [ ] **Step 2: Start the server locally**

Run: `uvicorn app.main:app --reload --port 8000` (requires valid AWS credentials, e.g. `AWS_PROFILE=ops-agent`, for a real end-to-end call — otherwise `/graph` will fail at boto3 client construction, which is expected without real credentials).

- [ ] **Step 3: Smoke-test the health endpoint**

Run: `curl -s http://localhost:8000/health`
Expected: `{"status":"ok"}`

- [ ] **Step 4: Smoke-test `/graph` against live AWS (manual, requires real credentials)**

Run: `curl -s http://localhost:8000/graph | python3 -m json.tool`
Expected: A JSON object with `"nodes"` (one entry per real EC2 instance, Lambda function, and DynamoDB table in the account, each with `cost_7d` and `last_metric_snapshot` populated) and `"edges"` (any `same_vpc`, `references`, or `iam_access` relationships the account's real resources actually have). An account with no resources of a given type simply contributes no nodes of that type — this is expected, not a bug.

- [ ] **Step 5: Commit** (only if Steps 1–4 required any fixes)

```bash
git add -A
git commit -m "test: verify Phase 1 static graph end-to-end"
```

---

## Self-Review Notes

- **Spec coverage:** All seven read tools from spec §4.1 (Tasks 2–6, `list_dynamodb_tables` added per this phase's scope) are covered. The Graph Builder's node model, cost aggregation, metric snapshots, and the three static-signal edge types from spec §4.2 are covered by Tasks 7–11. The `GET /graph` endpoint and the "tested via curl" exit bar from spec §7 Phase 1 are covered by Tasks 12–13.
- **Out of scope confirmed absent:** no `WS /graph/stream`, no agent swarm, no Traffic Generator, no action tools, no `PendingAction`/SQLite, no frontend — all correctly deferred to Phases 2–5 per spec §7.
- **Type consistency:** `build_graph(clients=None)` (Task 11) calls `list_ec2_instances(client=...)`, `list_lambda_functions(client=...)`, `list_dynamodb_tables(client=...)` (Tasks 4–5) with the exact signatures those tasks define; `build_ec2_node`/`build_lambda_node`/`build_dynamodb_node` (Task 7) are called with the exact dict shapes those list functions return; `get_metric_snapshot(resource_type, resource_id, client=..., now=...)` (Task 9) and `build_cost_by_resource_type(client=..., today=...)` (Task 8) are called identically from Task 11; `same_vpc_edges`/`lambda_env_var_edges`/`iam_access_edges` (Task 10) are called with the same `ec2_instances`/`lambda_functions`/`dynamodb_tables` lists Task 11 already has in hand. `app.main.get_graph` (Task 12) calls `build_graph()` with no arguments, matching Task 11's `clients: dict | None = None` default.
</content>
