# Phase 3 — Agent Swarm (Read-Only) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run three specialized agents (Cost, Performance, Security) that continuously investigate the live graph — each picks at most one node worth checking per cycle, runs a real Claude tool-use loop scoped to that node, and broadcasts `agent_move`/`finding` events over the existing `WS /graph/stream` channel. No actions, no approvals — narration only.

**Architecture:** Three named tool subsets (`app/agents/tools.py`) wrap Phase 1's AWS read tools with Anthropic tool-use schemas. A pure, cheap selection step per agent type (`app/agents/selection.py`) scans the Phase 2 `GraphStore`'s current nodes and decides whether there's anything worth investigating this cycle — Cost/Performance use a trailing-baseline threshold, Security round-robins through Lambda nodes. A generic async investigation function (`app/agents/investigate.py`) runs the actual bounded Claude tool-use loop for whichever node was selected. A generic `AgentRunner` (`app/agents/runner.py`), mirroring Phase 2's `GraphPoller`, ties selection + investigation + broadcast together on a fixed cadence. Three `AgentRunner` instances are wired into `app/main.py`'s existing lifespan alongside the graph poller.

**Tech Stack:** Python 3.11+, the `anthropic` SDK (new dependency this phase), FastAPI/asyncio (existing), pytest + `anyio` async tests (existing pattern from Phase 2).

**Spec:** `docs/spec.md` (section 4.3 Agent Swarm, section 7 Phase 3)

## Global Constraints

- No unit test may make a real AWS call (Phase 1/2 constraint) or a real Anthropic API call (new this phase) — `investigate_node`'s `client` parameter is always a mock in tests.
- Async tests use `@pytest.mark.anyio` with the `anyio_backend` fixture already defined in `backend/tests/conftest.py` (created in Phase 2) — do not recreate that file.
- Agent background loops are started only via `app/main.py`'s lifespan context manager (existing pattern from Phase 2) — they must never run during `pytest`, since plain `TestClient(app)` (used everywhere in this test suite) does not trigger lifespan.
- Default agent cadence is 60 seconds (spec §4.3) — distinct from the Graph Poller's 30-second default from Phase 2.
- Phase 3 is read-only: agents emit `agent_move` and `finding` events only. No action tools, no `PendingAction`, no approval flow — those are Phase 4.
- `backend/app/tools/{cloudwatch,compute,cost_explorer,iam}.py` (Phase 1) are not modified by this plan.

## Design Notes (Phase 3 scoping decisions)

- **The Cost agent's "per node" comparison is really per-resource-type**, inheriting Phase 1's `cost_7d` approximation (the same value is shared by every node of a resource type). Flagging still works as designed — it just means "this resource type's cost is trending up," attributed to whichever node happens to be checked. Revisit if per-resource billing ever becomes available.
- **The Security agent has no numeric per-node signal to threshold on.** IAM risk only becomes known once the Claude loop actually inspects a role's policy documents. Phase 3 uses simple round-robin selection over Lambda nodes instead, so the Security agent always has something to check — the investigation itself determines whether there's a real finding.
- **Agent history is in-memory only**, per `AgentRunner` instance, and resets on server restart. Fine for a live demo; revisit only if cross-restart trend memory becomes a real requirement.
- **`get_cloudwatch_metric` needs an adapter for tool-use.** The real function (Phase 1) expects Python `datetime` objects for `start_time`/`end_time`, but a Claude tool call supplies ISO-8601 strings per the tool's JSON schema. `app/agents/tools.py` registers a small adapter — under the same `"get_cloudwatch_metric"` dispatch name — that parses the strings before delegating to the real function, so `backend/app/tools/cloudwatch.py` itself stays untouched.
- **Investigation loops cap at 5 tool-use rounds** to guarantee termination; past the cap, a fixed fallback string (`"Investigation inconclusive after multiple tool calls."`) is returned as the finding.

---

## File Structure

- `backend/pyproject.toml` — add `anthropic>=0.34` to dependencies.
- `backend/app/agents/__init__.py` — empty package marker.
- `backend/app/agents/tools.py` — `COST_TOOL_NAMES`, `PERFORMANCE_TOOL_NAMES`, `SECURITY_TOOL_NAMES`, `tool_subset(names)`.
- `backend/app/agents/selection.py` — `select_cost_node`, `select_performance_node`, `select_security_node`.
- `backend/app/agents/investigate.py` — `investigate_node`.
- `backend/app/agents/runner.py` — `AgentRunner`.
- `backend/app/main.py` — modified: instantiate three `AgentRunner`s, start them in `lifespan`.
- `backend/tests/test_agent_tools.py`, `test_agent_selection.py`, `test_agent_investigate.py`, `test_agent_runner.py`, `test_main.py` (extended).

---

## Task 1: Agent tool subsets (`app/agents/tools.py`)

**Files:**
- Create: `backend/app/agents/__init__.py`
- Create: `backend/app/agents/tools.py`
- Test: `backend/tests/test_agent_tools.py`

**Interfaces:**
- Consumes: `get_cost_and_usage`, `list_ec2_instances`, `list_lambda_functions`, `get_cloudwatch_metric`, `get_cloudwatch_logs`, `get_iam_policy_for_role` (Phase 1, `backend/app/tools/*.py` — unmodified).
- Produces: `COST_TOOL_NAMES: list[str]`, `PERFORMANCE_TOOL_NAMES: list[str]`, `SECURITY_TOOL_NAMES: list[str]`; `tool_subset(names: list[str]) -> tuple[list[dict], dict]` — returns `(tool_definitions, tool_dispatch)` for exactly those names.

- [ ] **Step 1: Create `backend/app/agents/__init__.py`** (empty file)

- [ ] **Step 2: Write the failing tests** in `backend/tests/test_agent_tools.py`

```python
import datetime
from unittest.mock import patch

from app.agents.tools import (
    COST_TOOL_NAMES,
    PERFORMANCE_TOOL_NAMES,
    SECURITY_TOOL_NAMES,
    tool_subset,
)


def test_cost_tool_names_match_spec():
    assert COST_TOOL_NAMES == ["get_cost_and_usage", "list_ec2_instances", "list_lambda_functions"]


def test_performance_tool_names_match_spec():
    assert PERFORMANCE_TOOL_NAMES == [
        "get_cloudwatch_metric",
        "get_cloudwatch_logs",
        "list_lambda_functions",
        "list_ec2_instances",
    ]


def test_security_tool_names_match_spec():
    assert SECURITY_TOOL_NAMES == [
        "get_iam_policy_for_role",
        "list_ec2_instances",
        "list_lambda_functions",
    ]


def test_tool_subset_returns_matching_definitions_and_dispatch():
    definitions, dispatch = tool_subset(COST_TOOL_NAMES)

    assert {d["name"] for d in definitions} == set(COST_TOOL_NAMES)
    assert set(dispatch.keys()) == set(COST_TOOL_NAMES)
    assert callable(dispatch["list_ec2_instances"])


def test_tool_subset_definitions_have_input_schema():
    definitions, _ = tool_subset(SECURITY_TOOL_NAMES)
    for definition in definitions:
        assert "description" in definition
        assert definition["input_schema"]["type"] == "object"


def test_cloudwatch_metric_tool_adapter_parses_iso_timestamps():
    _, dispatch = tool_subset(PERFORMANCE_TOOL_NAMES)

    with patch("app.agents.tools.get_cloudwatch_metric", return_value=[]) as mock_get_metric:
        dispatch["get_cloudwatch_metric"](
            namespace="AWS/Lambda",
            metric_name="Duration",
            dimensions={"FunctionName": "my-service"},
            start_time="2026-09-14T00:00:00",
            end_time="2026-09-14T01:00:00",
            stat="Average",
        )

    mock_get_metric.assert_called_once_with(
        namespace="AWS/Lambda",
        metric_name="Duration",
        dimensions={"FunctionName": "my-service"},
        start_time=datetime.datetime(2026, 9, 14, 0, 0, 0),
        end_time=datetime.datetime(2026, 9, 14, 1, 0, 0),
        stat="Average",
        client=None,
    )
```

- [ ] **Step 3: Run tests to verify they fail**

Run (from `backend/`): `pytest tests/test_agent_tools.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.agents.tools'`

- [ ] **Step 4: Write minimal implementation** in `backend/app/agents/tools.py`

```python
import datetime

from app.tools.cloudwatch import get_cloudwatch_logs, get_cloudwatch_metric
from app.tools.compute import list_ec2_instances, list_lambda_functions
from app.tools.cost_explorer import get_cost_and_usage
from app.tools.iam import get_iam_policy_for_role

COST_TOOL_NAMES = ["get_cost_and_usage", "list_ec2_instances", "list_lambda_functions"]
PERFORMANCE_TOOL_NAMES = [
    "get_cloudwatch_metric",
    "get_cloudwatch_logs",
    "list_lambda_functions",
    "list_ec2_instances",
]
SECURITY_TOOL_NAMES = ["get_iam_policy_for_role", "list_ec2_instances", "list_lambda_functions"]


def _get_cloudwatch_metric_from_tool_call(
    namespace: str,
    metric_name: str,
    dimensions: dict,
    start_time: str,
    end_time: str,
    stat: str,
    client=None,
) -> list[dict]:
    return get_cloudwatch_metric(
        namespace=namespace,
        metric_name=metric_name,
        dimensions=dimensions,
        start_time=datetime.datetime.fromisoformat(start_time),
        end_time=datetime.datetime.fromisoformat(end_time),
        stat=stat,
        client=client,
    )


_ALL_TOOL_DEFINITIONS = {
    "get_cost_and_usage": {
        "name": "get_cost_and_usage",
        "description": "Wrap Cost Explorer GetCostAndUsage to return cost totals, optionally grouped by a dimension.",
        "input_schema": {
            "type": "object",
            "properties": {
                "start_date": {"type": "string", "description": "YYYY-MM-DD"},
                "end_date": {"type": "string", "description": "YYYY-MM-DD"},
                "granularity": {"type": "string", "enum": ["DAILY", "MONTHLY", "HOURLY"]},
                "group_by": {"type": "string", "description": "e.g. SERVICE"},
            },
            "required": ["start_date", "end_date"],
        },
    },
    "list_ec2_instances": {
        "name": "list_ec2_instances",
        "description": "Describe EC2 instances with state, type, launch time, tags, and VPC id.",
        "input_schema": {
            "type": "object",
            "properties": {
                "filters": {
                    "type": "array",
                    "description": "EC2 describe_instances Filters list",
                    "items": {"type": "object"},
                },
            },
        },
    },
    "list_lambda_functions": {
        "name": "list_lambda_functions",
        "description": "List Lambda functions with runtime, memory, timeout config, role ARN, and environment variables.",
        "input_schema": {"type": "object", "properties": {}},
    },
    "get_cloudwatch_metric": {
        "name": "get_cloudwatch_metric",
        "description": "Return a CloudWatch metric datapoint series for the given namespace/metric/dimensions.",
        "input_schema": {
            "type": "object",
            "properties": {
                "namespace": {"type": "string"},
                "metric_name": {"type": "string"},
                "dimensions": {"type": "object", "description": "Dimension name/value pairs"},
                "start_time": {"type": "string", "description": "ISO 8601 timestamp"},
                "end_time": {"type": "string", "description": "ISO 8601 timestamp"},
                "stat": {"type": "string", "description": "e.g. Average, Sum, Maximum"},
            },
            "required": ["namespace", "metric_name", "dimensions", "start_time", "end_time", "stat"],
        },
    },
    "get_cloudwatch_logs": {
        "name": "get_cloudwatch_logs",
        "description": "Run a CloudWatch Logs Insights query against a log group and return matched log records.",
        "input_schema": {
            "type": "object",
            "properties": {
                "log_group": {"type": "string"},
                "query": {"type": "string"},
                "start_time": {"type": "integer", "description": "Unix epoch seconds"},
                "end_time": {"type": "integer", "description": "Unix epoch seconds"},
            },
            "required": ["log_group", "query", "start_time", "end_time"],
        },
    },
    "get_iam_policy_for_role": {
        "name": "get_iam_policy_for_role",
        "description": "Return an IAM role's attached and inline policy documents for analysis.",
        "input_schema": {
            "type": "object",
            "properties": {"role_name": {"type": "string"}},
            "required": ["role_name"],
        },
    },
}

_ALL_TOOL_DISPATCH = {
    "get_cost_and_usage": get_cost_and_usage,
    "list_ec2_instances": list_ec2_instances,
    "list_lambda_functions": list_lambda_functions,
    "get_cloudwatch_metric": _get_cloudwatch_metric_from_tool_call,
    "get_cloudwatch_logs": get_cloudwatch_logs,
    "get_iam_policy_for_role": get_iam_policy_for_role,
}


def tool_subset(names: list[str]) -> tuple[list[dict], dict]:
    definitions = [_ALL_TOOL_DEFINITIONS[name] for name in names]
    dispatch = {name: _ALL_TOOL_DISPATCH[name] for name in names}
    return definitions, dispatch
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pytest tests/test_agent_tools.py -v`
Expected: PASS (5 tests)

- [ ] **Step 6: Commit**

```bash
git add backend/app/agents/__init__.py backend/app/agents/tools.py backend/tests/test_agent_tools.py
git commit -m "feat: add per-agent AWS tool subsets with a CloudWatch metric adapter"
```

---

## Task 2: Node selection heuristics (`app/agents/selection.py`)

**Files:**
- Create: `backend/app/agents/selection.py`
- Test: `backend/tests/test_agent_selection.py`

**Interfaces:**
- Consumes: graph node shape `{"node_id": str, "resource_type": str, "cost_7d": float | None, "last_metric_snapshot": {"timestamp": str, "value": float} | None, ...}` (Phase 1, `backend/app/graph/nodes.py`).
- Produces: `select_cost_node(nodes: dict, history: dict) -> str | None`, `select_performance_node(nodes: dict, history: dict) -> str | None`, `select_security_node(nodes: dict, history: dict) -> str | None`. `history` is a caller-owned, mutable dict the function updates in place across calls.

- [ ] **Step 1: Write the failing tests** in `backend/tests/test_agent_selection.py`

```python
from app.agents.selection import select_cost_node, select_performance_node, select_security_node


def test_select_cost_node_returns_none_on_first_observation():
    nodes = {"ec2:i-1": {"cost_7d": 10.0}}
    history = {}

    assert select_cost_node(nodes, history) is None
    assert history["ec2:i-1"] == [10.0]


def test_select_cost_node_returns_none_when_under_threshold():
    history = {"ec2:i-1": [10.0]}
    nodes = {"ec2:i-1": {"cost_7d": 12.0}}

    assert select_cost_node(nodes, history) is None


def test_select_cost_node_returns_node_when_over_threshold():
    history = {"ec2:i-1": [10.0]}
    nodes = {"ec2:i-1": {"cost_7d": 20.0}}

    assert select_cost_node(nodes, history) == "ec2:i-1"


def test_select_cost_node_ignores_nodes_with_no_cost_data():
    nodes = {"lambda:fn": {"cost_7d": None}}
    history = {}

    assert select_cost_node(nodes, history) is None
    assert "lambda:fn" not in history


def test_select_performance_node_uses_last_metric_snapshot_value():
    history = {"lambda:fn": [10.0]}
    nodes = {"lambda:fn": {"last_metric_snapshot": {"timestamp": "t", "value": 50.0}}}

    assert select_performance_node(nodes, history) == "lambda:fn"


def test_select_performance_node_ignores_nodes_without_metric_snapshot():
    nodes = {"lambda:fn": {"last_metric_snapshot": None}}
    history = {}

    assert select_performance_node(nodes, history) is None


def test_select_security_node_round_robins_through_lambda_nodes():
    nodes = {
        "lambda:a": {"resource_type": "lambda"},
        "lambda:b": {"resource_type": "lambda"},
        "ec2:i-1": {"resource_type": "ec2"},
    }
    history = {}

    first = select_security_node(nodes, history)
    second = select_security_node(nodes, history)
    third = select_security_node(nodes, history)

    assert [first, second, third] == ["lambda:a", "lambda:b", "lambda:a"]


def test_select_security_node_returns_none_when_no_lambda_nodes():
    nodes = {"ec2:i-1": {"resource_type": "ec2"}}
    history = {}

    assert select_security_node(nodes, history) is None
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_agent_selection.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.agents.selection'`

- [ ] **Step 3: Write minimal implementation** in `backend/app/agents/selection.py`

```python
THRESHOLD_FACTOR = 1.5
MAX_HISTORY_LENGTH = 5


def _pick_node_above_threshold(nodes: dict, history: dict, value_fn) -> str | None:
    selected = None
    for node_id, node in nodes.items():
        value = value_fn(node)
        if value is None:
            continue

        past_values = history.setdefault(node_id, [])
        if selected is None and past_values:
            baseline = sum(past_values) / len(past_values)
            if baseline > 0 and value > baseline * THRESHOLD_FACTOR:
                selected = node_id

        past_values.append(value)
        if len(past_values) > MAX_HISTORY_LENGTH:
            past_values.pop(0)

    return selected


def select_cost_node(nodes: dict, history: dict) -> str | None:
    return _pick_node_above_threshold(nodes, history, lambda node: node.get("cost_7d"))


def select_performance_node(nodes: dict, history: dict) -> str | None:
    def value_fn(node):
        snapshot = node.get("last_metric_snapshot")
        return snapshot["value"] if snapshot else None

    return _pick_node_above_threshold(nodes, history, value_fn)


def select_security_node(nodes: dict, history: dict) -> str | None:
    lambda_ids = sorted(
        node_id for node_id, node in nodes.items() if node.get("resource_type") == "lambda"
    )
    if not lambda_ids:
        return None

    cursor = history.get("cursor", 0) % len(lambda_ids)
    history["cursor"] = cursor + 1
    return lambda_ids[cursor]
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_agent_selection.py -v`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/app/agents/selection.py backend/tests/test_agent_selection.py
git commit -m "feat: add trailing-baseline and round-robin node selection heuristics"
```

---

## Task 3: Claude tool-use investigation loop (`app/agents/investigate.py`)

**Files:**
- Modify: `backend/pyproject.toml` (add `anthropic>=0.34` to dependencies)
- Create: `backend/app/agents/investigate.py`
- Test: `backend/tests/test_agent_investigate.py`

**Interfaces:**
- Consumes: node shape `{"node_id": str, "resource_type": str, "name": str, ...}` (Phase 1); `tool_definitions`/`tool_dispatch` shapes from `tool_subset` (Task 1).
- Produces: `async investigate_node(node: dict, investigation_focus: str, tool_definitions: list[dict], tool_dispatch: dict, client=None) -> str`.

- [ ] **Step 1: Add the dependency** — in `backend/pyproject.toml`, update the `dependencies` list:

```toml
dependencies = [
    "fastapi>=0.110",
    "uvicorn>=0.29",
    "boto3>=1.34",
    "pydantic>=2.6",
    "anthropic>=0.34",
]
```

- [ ] **Step 2: Install the new dependency**

Run (from `backend/`): `pip install -e ".[dev]"`

- [ ] **Step 3: Write the failing tests** in `backend/tests/test_agent_investigate.py`

```python
from unittest.mock import MagicMock

import pytest

from app.agents.investigate import investigate_node


def _text_block(text):
    block = MagicMock()
    block.type = "text"
    block.text = text
    return block


def _tool_use_block(tool_id, name, tool_input):
    block = MagicMock()
    block.type = "tool_use"
    block.id = tool_id
    block.name = name
    block.input = tool_input
    return block


@pytest.mark.anyio
async def test_investigate_node_returns_text_when_no_tool_use():
    mock_client = MagicMock()
    response = MagicMock()
    response.stop_reason = "end_turn"
    response.content = [_text_block("Cost looks stable.")]
    mock_client.messages.create.return_value = response

    node = {"node_id": "ec2:i-1", "resource_type": "ec2", "name": "web"}

    text = await investigate_node(node, "cost trends", [], {}, client=mock_client)

    assert text == "Cost looks stable."
    mock_client.messages.create.assert_called_once()


@pytest.mark.anyio
async def test_investigate_node_executes_tool_then_returns_final_text():
    mock_client = MagicMock()

    tool_response = MagicMock()
    tool_response.stop_reason = "tool_use"
    tool_response.content = [_tool_use_block("t1", "list_lambda_functions", {})]

    final_response = MagicMock()
    final_response.stop_reason = "end_turn"
    final_response.content = [_text_block("One function found, no issues.")]

    mock_client.messages.create.side_effect = [tool_response, final_response]

    node = {"node_id": "lambda:fn", "resource_type": "lambda", "name": "fn"}
    tool_dispatch = {"list_lambda_functions": lambda: [{"function_name": "fn"}]}

    text = await investigate_node(node, "performance issues", [], tool_dispatch, client=mock_client)

    assert text == "One function found, no issues."
    assert mock_client.messages.create.call_count == 2


@pytest.mark.anyio
async def test_investigate_node_reports_tool_error_without_raising():
    mock_client = MagicMock()

    tool_response = MagicMock()
    tool_response.stop_reason = "tool_use"
    tool_response.content = [_tool_use_block("t1", "get_iam_policy_for_role", {"role_name": "r"})]

    final_response = MagicMock()
    final_response.stop_reason = "end_turn"
    final_response.content = [_text_block("Could not verify policy.")]

    mock_client.messages.create.side_effect = [tool_response, final_response]

    def broken_tool(**kwargs):
        raise RuntimeError("boto3 boom")

    node = {"node_id": "lambda:fn", "resource_type": "lambda", "name": "fn"}

    text = await investigate_node(
        node, "IAM security risks", [], {"get_iam_policy_for_role": broken_tool}, client=mock_client
    )

    assert text == "Could not verify policy."


@pytest.mark.anyio
async def test_investigate_node_stops_after_max_iterations():
    mock_client = MagicMock()
    looping_response = MagicMock()
    looping_response.stop_reason = "tool_use"
    looping_response.content = [_tool_use_block("t1", "noop", {})]
    mock_client.messages.create.return_value = looping_response

    node = {"node_id": "ec2:i-1", "resource_type": "ec2", "name": "web"}

    text = await investigate_node(node, "cost trends", [], {"noop": lambda: {}}, client=mock_client)

    assert text == "Investigation inconclusive after multiple tool calls."
    assert mock_client.messages.create.call_count == 5
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `pytest tests/test_agent_investigate.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.agents.investigate'`

- [ ] **Step 5: Write minimal implementation** in `backend/app/agents/investigate.py`

```python
import asyncio
import json

from anthropic import Anthropic

MODEL = "claude-sonnet-5"
MAX_TOKENS = 1024
MAX_TOOL_ITERATIONS = 5
FALLBACK_FINDING = "Investigation inconclusive after multiple tool calls."


async def investigate_node(
    node: dict,
    investigation_focus: str,
    tool_definitions: list[dict],
    tool_dispatch: dict,
    client=None,
) -> str:
    client = client or Anthropic()
    messages = [
        {
            "role": "user",
            "content": (
                f"Investigate {node['resource_type']} resource '{node['name']}' "
                f"(node id {node['node_id']}) for {investigation_focus}. "
                "Use the available tools to gather real data, then give a concise "
                "(2-3 sentence) plain-language finding."
            ),
        }
    ]

    for _ in range(MAX_TOOL_ITERATIONS):
        response = await asyncio.to_thread(
            client.messages.create,
            model=MODEL,
            max_tokens=MAX_TOKENS,
            tools=tool_definitions,
            messages=messages,
        )
        messages.append({"role": "assistant", "content": response.content})

        if response.stop_reason != "tool_use":
            return "\n".join(block.text for block in response.content if block.type == "text")

        tool_results = []
        for block in response.content:
            if block.type != "tool_use":
                continue
            try:
                result = tool_dispatch[block.name](**block.input)
                content = json.dumps(result, default=str)
            except Exception as exc:
                content = json.dumps({"error": str(exc)})
            tool_results.append(
                {"type": "tool_result", "tool_use_id": block.id, "content": content}
            )
        messages.append({"role": "user", "content": tool_results})

    return FALLBACK_FINDING
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pytest tests/test_agent_investigate.py -v`
Expected: PASS (4 tests)

- [ ] **Step 7: Commit**

```bash
git add backend/pyproject.toml backend/app/agents/investigate.py backend/tests/test_agent_investigate.py
git commit -m "feat: add bounded Claude tool-use investigation loop"
```

---

## Task 4: Generic agent runner (`app/agents/runner.py`)

**Files:**
- Create: `backend/app/agents/runner.py`
- Test: `backend/tests/test_agent_runner.py`

**Interfaces:**
- Consumes: a store exposing `get() -> dict` (Phase 2, `GraphStore`); a broadcaster exposing `async broadcast(event: dict)` (Phase 2, `ConnectionManager`); a `select_node_fn(nodes, history) -> str | None` (Task 2); `investigate_node` (Task 3, injectable as `investigate_fn`).
- Produces: `AgentRunner(agent_id: str, store, broadcaster, select_node_fn, tool_definitions: list[dict], tool_dispatch: dict, investigation_focus: str, client=None, interval_seconds: float = 60.0, investigate_fn=investigate_node)` with `async run_cycle() -> dict | None` and `async run_forever(iterations: int | None = None) -> None`.

- [ ] **Step 1: Write the failing tests** in `backend/tests/test_agent_runner.py`

```python
from unittest.mock import AsyncMock

import pytest

from app.agents.runner import AgentRunner


class FakeStore:
    def __init__(self, nodes: dict):
        self._graph = {"nodes": nodes, "edges": []}

    def get(self) -> dict:
        return self._graph


@pytest.mark.anyio
async def test_run_cycle_emits_agent_move_then_finding_when_node_selected():
    store = FakeStore({"ec2:i-1": {"node_id": "ec2:i-1", "resource_type": "ec2"}})
    broadcaster = AsyncMock()

    async def fake_investigate(node, focus, definitions, dispatch, client=None):
        return "Cost trending up 60%."

    runner = AgentRunner(
        agent_id="cost",
        store=store,
        broadcaster=broadcaster,
        select_node_fn=lambda nodes, history: "ec2:i-1",
        tool_definitions=[],
        tool_dispatch={},
        investigation_focus="cost trends",
        investigate_fn=fake_investigate,
    )

    result = await runner.run_cycle()

    assert result == {
        "type": "finding",
        "agent_id": "cost",
        "node_id": "ec2:i-1",
        "text": "Cost trending up 60%.",
    }
    assert broadcaster.broadcast.await_args_list[0].args[0] == {
        "type": "agent_move",
        "agent_id": "cost",
        "target_node_id": "ec2:i-1",
    }
    assert broadcaster.broadcast.await_args_list[1].args[0] == result


@pytest.mark.anyio
async def test_run_cycle_does_nothing_when_no_node_selected():
    store = FakeStore({})
    broadcaster = AsyncMock()

    runner = AgentRunner(
        agent_id="cost",
        store=store,
        broadcaster=broadcaster,
        select_node_fn=lambda nodes, history: None,
        tool_definitions=[],
        tool_dispatch={},
        investigation_focus="cost trends",
    )

    result = await runner.run_cycle()

    assert result is None
    broadcaster.broadcast.assert_not_awaited()


@pytest.mark.anyio
async def test_run_forever_runs_the_requested_number_of_cycles():
    store = FakeStore({"ec2:i-1": {"node_id": "ec2:i-1", "resource_type": "ec2"}})
    broadcaster = AsyncMock()
    call_count = 0

    async def fake_investigate(node, focus, definitions, dispatch, client=None):
        nonlocal call_count
        call_count += 1
        return "finding"

    runner = AgentRunner(
        agent_id="cost",
        store=store,
        broadcaster=broadcaster,
        select_node_fn=lambda nodes, history: "ec2:i-1",
        tool_definitions=[],
        tool_dispatch={},
        investigation_focus="cost trends",
        investigate_fn=fake_investigate,
        interval_seconds=0,
    )

    await runner.run_forever(iterations=2)

    assert call_count == 2
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_agent_runner.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.agents.runner'`

- [ ] **Step 3: Write minimal implementation** in `backend/app/agents/runner.py`

```python
import asyncio

from app.agents.investigate import investigate_node


class AgentRunner:
    def __init__(
        self,
        agent_id: str,
        store,
        broadcaster,
        select_node_fn,
        tool_definitions: list[dict],
        tool_dispatch: dict,
        investigation_focus: str,
        client=None,
        interval_seconds: float = 60.0,
        investigate_fn=investigate_node,
    ) -> None:
        self.agent_id = agent_id
        self.store = store
        self.broadcaster = broadcaster
        self.select_node_fn = select_node_fn
        self.tool_definitions = tool_definitions
        self.tool_dispatch = tool_dispatch
        self.investigation_focus = investigation_focus
        self.client = client
        self.interval_seconds = interval_seconds
        self._investigate_fn = investigate_fn
        self._history: dict = {}

    async def run_cycle(self) -> dict | None:
        nodes = self.store.get()["nodes"]
        node_id = self.select_node_fn(nodes, self._history)
        if node_id is None:
            return None

        node = nodes[node_id]
        await self.broadcaster.broadcast(
            {"type": "agent_move", "agent_id": self.agent_id, "target_node_id": node_id}
        )

        text = await self._investigate_fn(
            node, self.investigation_focus, self.tool_definitions, self.tool_dispatch, client=self.client
        )

        finding_event = {
            "type": "finding",
            "agent_id": self.agent_id,
            "node_id": node_id,
            "text": text,
        }
        await self.broadcaster.broadcast(finding_event)
        return finding_event

    async def run_forever(self, iterations: int | None = None) -> None:
        count = 0
        while iterations is None or count < iterations:
            await self.run_cycle()
            count += 1
            if iterations is None or count < iterations:
                await asyncio.sleep(self.interval_seconds)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_agent_runner.py -v`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/app/agents/runner.py backend/tests/test_agent_runner.py
git commit -m "feat: add generic per-agent investigate-and-broadcast runner"
```

---

## Task 5: Wire three agents into `app/main.py`

**Files:**
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_main.py`

**Interfaces:**
- Consumes: `AgentRunner` (Task 4); `select_cost_node`/`select_performance_node`/`select_security_node` (Task 2); `tool_subset`, `COST_TOOL_NAMES`, `PERFORMANCE_TOOL_NAMES`, `SECURITY_TOOL_NAMES` (Task 1).
- Produces: app-level singletons `cost_agent`, `performance_agent`, `security_agent` importable from `app.main`, started as background tasks in `lifespan` alongside `graph_poller`.

- [ ] **Step 1: Write the failing test** (append to `backend/tests/test_main.py`)

```python
def test_agents_are_configured_with_correct_ids_and_tools():
    from app.main import cost_agent, performance_agent, security_agent

    assert cost_agent.agent_id == "cost"
    assert performance_agent.agent_id == "performance"
    assert security_agent.agent_id == "security"

    assert set(cost_agent.tool_dispatch.keys()) == {
        "get_cost_and_usage",
        "list_ec2_instances",
        "list_lambda_functions",
    }
    assert set(performance_agent.tool_dispatch.keys()) == {
        "get_cloudwatch_metric",
        "get_cloudwatch_logs",
        "list_lambda_functions",
        "list_ec2_instances",
    }
    assert set(security_agent.tool_dispatch.keys()) == {
        "get_iam_policy_for_role",
        "list_ec2_instances",
        "list_lambda_functions",
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_main.py -v`
Expected: FAIL — `cost_agent`, `performance_agent`, `security_agent` don't exist in `app.main` yet.

- [ ] **Step 3: Write minimal implementation** — replace the contents of `backend/app/main.py`

```python
import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect

from app.agents.runner import AgentRunner
from app.agents.selection import select_cost_node, select_performance_node, select_security_node
from app.agents.tools import (
    COST_TOOL_NAMES,
    PERFORMANCE_TOOL_NAMES,
    SECURITY_TOOL_NAMES,
    tool_subset,
)
from app.graph.broadcast import ConnectionManager
from app.graph.poller import GraphPoller
from app.graph.store import GraphStore

graph_store = GraphStore()
connection_manager = ConnectionManager()
graph_poller = GraphPoller(store=graph_store, broadcaster=connection_manager)

cost_tool_definitions, cost_tool_dispatch = tool_subset(COST_TOOL_NAMES)
performance_tool_definitions, performance_tool_dispatch = tool_subset(PERFORMANCE_TOOL_NAMES)
security_tool_definitions, security_tool_dispatch = tool_subset(SECURITY_TOOL_NAMES)

cost_agent = AgentRunner(
    agent_id="cost",
    store=graph_store,
    broadcaster=connection_manager,
    select_node_fn=select_cost_node,
    tool_definitions=cost_tool_definitions,
    tool_dispatch=cost_tool_dispatch,
    investigation_focus="cost trends",
)
performance_agent = AgentRunner(
    agent_id="performance",
    store=graph_store,
    broadcaster=connection_manager,
    select_node_fn=select_performance_node,
    tool_definitions=performance_tool_definitions,
    tool_dispatch=performance_tool_dispatch,
    investigation_focus="performance and latency issues",
)
security_agent = AgentRunner(
    agent_id="security",
    store=graph_store,
    broadcaster=connection_manager,
    select_node_fn=select_security_node,
    tool_definitions=security_tool_definitions,
    tool_dispatch=security_tool_dispatch,
    investigation_focus="IAM security risks such as overly broad permissions",
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    tasks = [
        asyncio.create_task(graph_poller.run_forever()),
        asyncio.create_task(cost_agent.run_forever()),
        asyncio.create_task(performance_agent.run_forever()),
        asyncio.create_task(security_agent.run_forever()),
    ]
    yield
    for task in tasks:
        task.cancel()


app = FastAPI(title="Cloudsentry Graph API", lifespan=lifespan)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/graph")
def get_graph():
    return graph_store.get()


@app.websocket("/graph/stream")
async def graph_stream(websocket: WebSocket):
    await connection_manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        connection_manager.disconnect(websocket)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_main.py -v`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/app/main.py backend/tests/test_main.py
git commit -m "feat: wire cost, performance, and security agents into the app lifespan"
```

---

## Task 6: Full-suite verification + manual live verification

**Files:** none created; this task verifies the assembled system.

- [ ] **Step 1: Run the full backend test suite**

Run (from `backend/`): `pytest -v`
Expected: All tests across every module in this plan (plus everything from Phases 1–2) PASS.

- [ ] **Step 2: Start the server locally**

Run: `ANTHROPIC_API_KEY=<your key> AWS_PROFILE=ops-agent AWS_DEFAULT_REGION=us-east-1 uvicorn app.main:app --port 8000` (requires both a real Anthropic API key and AWS credentials — lifespan now starts the graph poller and all three agents against live services).

- [ ] **Step 3: Connect a WebSocket listener and watch for agent activity**

Reuse the same throwaway approach from the Phase 2 manual verification (`pip install websockets` if not already installed):

```bash
python3 -c "
import asyncio
import websockets

async def main():
    async with websockets.connect('ws://localhost:8000/graph/stream') as ws:
        while True:
            print(await ws.recv())

asyncio.run(main())
"
```

Expected: Within the first ~60s, an `agent_move` event with `\"agent_id\": \"security\"` appears (round-robin acts immediately, no baseline needed), followed by a `finding` event with a real IAM-grounded description for a Lambda function's role. Cost and Performance agents need at least two ~60s cycles each (the first records a baseline, the second may or may not cross the 1.5x threshold, since real cost/metric fluctuation over a short demo window is unpredictable) — seeing their `agent_move`/`finding` events within a few minutes confirms the loop works; not seeing one in a single short session is expected and not a failure, since it depends on genuine account activity crossing the threshold.

- [ ] **Step 4: Stop the server and listener**

Stop both processes with Ctrl+C.

- [ ] **Step 5: Commit** (only if Steps 1–3 required any fixes)

```bash
git add -A
git commit -m "test: verify Phase 3 agent swarm end-to-end"
```

---

## Self-Review Notes

- **Spec coverage:** The three agents' scoped tool subsets and the "agent_move before investigating, then finding" event sequence from spec §4.3 are covered by Tasks 1–5. The "picks at most one node worth investigating (or none)" per-cycle selection logic is covered by Task 2. The "same pattern" Claude tool-use loop is covered by Task 3. The read-only exit bar from spec §7 Phase 3 ("each produces at least one real finding grounded in real AWS API responses") is covered by Task 6.
- **Out of scope confirmed absent:** no action tool calls, no `PendingAction`, no `action_proposed` events, no approval flow, no frontend — all correctly deferred to Phase 4+ per spec §7. `investigate_node` only ever calls tools from an agent's own read-only subset; none of the three subsets include an action tool.
- **Type consistency:** `AgentRunner.run_cycle()` (Task 4) calls `self.select_node_fn(nodes, self._history)` matching the exact `(nodes, history) -> str | None` signature from Task 2's three selection functions, and `self._investigate_fn(node, self.investigation_focus, self.tool_definitions, self.tool_dispatch, client=self.client)` matching `investigate_node`'s exact signature from Task 3. `app.main`'s three `AgentRunner(...)` constructions (Task 5) use the exact keyword arguments defined in Task 4, and `tool_subset(COST_TOOL_NAMES)` etc. use the exact `(definitions, dispatch)` return shape from Task 1.
</content>
