# Phase 4 — Action/Approval Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let each agent propose one domain-matched action (Cost → stop an idle EC2 instance, Performance → resize an EC2 instance, Security → tighten an IAM policy) as a `PendingAction` requiring explicit human approval, and add `GET /actions`, `POST /actions/{id}/approve`, and `POST /actions/{id}/reject` so approval actually executes the real AWS mutation.

**Architecture:** Real, mutating boto3 wrappers (`app/tools/actions.py`) are never called by an agent directly. Instead, each agent's one action tool is a per-cycle-bound closure (`app/actions/proposals.py`) that writes a `PendingAction` row to a SQLite-backed `ActionStore` (`app/actions/store.py`) and hands Claude back a "proposed, pending approval" result. `investigate_node` and `AgentRunner` (both Phase 3 files, evolved here) collect any proposed actions from a cycle and broadcast `action_proposed`. Only `POST /actions/{id}/approve` — a human-triggered HTTP call — invokes the real executor (`app/actions/executor.py`), which does the actual AWS mutation and records the outcome.

**Tech Stack:** Python 3.11+ (existing), `sqlite3` (standard library, new persistence layer), FastAPI (existing), pytest + anyio async tests (existing pattern).

**Spec:** `docs/spec.md` (section 4.1 action tools, section 4.4 Action/Approval Subsystem, section 7 Phase 4)

## Global Constraints

- No automated test may make a real AWS call or a real Anthropic API call — carried forward from Phases 1–3.
- Async tests use `@pytest.mark.anyio` with the existing `anyio_backend` fixture in `backend/tests/conftest.py` — do not recreate it.
- Background agent/poller loops run only via `app/main.py`'s lifespan — never during `pytest` (plain `TestClient(app)` doesn't trigger it).
- `backend/app/tools/{cloudwatch,compute,cost_explorer,iam}.py` (the read-only AWS Tool Layer from Phase 1) are not modified by this plan.
- Every action tool call from an agent creates a `PendingAction`, never executes directly (spec §4.1, §4.4) — only `POST /actions/{id}/approve` performs the real mutation.

## Design Notes (Phase 4 scoping decisions)

- **The SQLite file is not reset between local test runs.** `ActionStore`'s production instance in `app/main.py` points at a real file (`cloudsentry_actions.db`, gitignored) that persists across `pytest` invocations in the same worktree. Every test that seeds data does so with its own freshly generated action id and asserts by looking that record up or checking membership — never by asserting the full list is exactly N items.
- **`investigate_node` and `AgentRunner`'s contracts change from Phase 3.** `investigate_node` now returns `(text, proposed_actions)` instead of just `text`. This is an intentional evolution of files this project wrote in Phase 3 — not a violation of "don't modify the read-only AWS Tool Layer," which only protects `backend/app/tools/{cloudwatch,compute,cost_explorer,iam}.py`.
- **Action tool dispatch is bound per investigation cycle, not statically like the read tools.** A `PendingAction` needs to know which agent and which node proposed it, and that's only known once `AgentRunner.run_cycle()` has already selected a node — so `tool_subset()` deliberately leaves action tools out of its static dispatch dict, and `AgentRunner` injects a freshly-bound closure into a per-cycle copy of the dispatch table.
- **Approve always resolves `status` to `"approved"`, regardless of whether the underlying AWS mutation itself succeeded.** `status` records the human's decision; the nested `result.success` boolean records the technical outcome. This keeps the audit trail's `status` vocabulary simple (`pending` / `approved` / `rejected`) while still capturing failures.

---

## File Structure

- `backend/app/tools/actions.py` — `stop_ec2_instance`, `resize_ec2_instance`, `tighten_iam_policy` (real, mutating boto3 wrappers).
- `backend/app/actions/__init__.py` — empty package marker.
- `backend/app/actions/store.py` — `ActionStore`.
- `backend/app/actions/proposals.py` — `propose_action`, `build_action_tool`.
- `backend/app/actions/executor.py` — `EXECUTOR_DISPATCH`, `execute_action`.
- `backend/app/agents/tools.py` — modified: `ACTION_TOOL_NAMES` + three new tool-use schemas; `tool_subset` skips missing dispatch entries.
- `backend/app/agents/investigate.py` — modified: `investigate_node` returns `(text, proposed_actions)`.
- `backend/app/agents/runner.py` — modified: `AgentRunner` binds action tools per-cycle, emits `action_proposed`.
- `backend/app/main.py` — modified: wires `ActionStore` + action tool names into the three agents; adds `/actions` routes.
- `.gitignore` — modified: ignore the SQLite runtime file.
- Tests: `backend/tests/test_tools_actions.py`, `test_action_store.py`, `test_action_proposals.py`, `test_action_executor.py`, `test_agent_tools.py` (extended), `test_agent_investigate.py` (rewritten), `test_agent_runner.py` (rewritten), `test_main.py` (extended).

---

## Task 1: Real AWS mutation functions (`app/tools/actions.py`)

**Files:**
- Create: `backend/app/tools/actions.py`
- Test: `backend/tests/test_tools_actions.py`

**Interfaces:**
- Produces: `stop_ec2_instance(instance_id: str, client=None) -> dict`, `resize_ec2_instance(instance_id: str, new_instance_type: str, client=None) -> dict`, `tighten_iam_policy(role_name: str, policy_name: str, new_policy_document: dict, client=None) -> dict`.

- [ ] **Step 1: Write the failing tests** in `backend/tests/test_tools_actions.py`

```python
import json
from unittest.mock import MagicMock

from app.tools.actions import resize_ec2_instance, stop_ec2_instance, tighten_iam_policy


def test_stop_ec2_instance_calls_stop_instances():
    mock_client = MagicMock()

    result = stop_ec2_instance("i-0123abc", client=mock_client)

    assert result == {"instance_id": "i-0123abc", "action": "stop"}
    mock_client.stop_instances.assert_called_once_with(InstanceIds=["i-0123abc"])


def test_resize_ec2_instance_calls_modify_instance_attribute():
    mock_client = MagicMock()

    result = resize_ec2_instance("i-0123abc", "t3.small", client=mock_client)

    assert result == {
        "instance_id": "i-0123abc",
        "new_instance_type": "t3.small",
        "action": "resize",
    }
    mock_client.modify_instance_attribute.assert_called_once_with(
        InstanceId="i-0123abc", InstanceType={"Value": "t3.small"}
    )


def test_tighten_iam_policy_calls_put_role_policy():
    mock_client = MagicMock()
    policy_document = {"Statement": [{"Effect": "Allow", "Action": "s3:GetObject", "Resource": "*"}]}

    result = tighten_iam_policy("my-role", "MyPolicy", policy_document, client=mock_client)

    assert result == {"role_name": "my-role", "policy_name": "MyPolicy", "action": "tighten_iam_policy"}
    mock_client.put_role_policy.assert_called_once_with(
        RoleName="my-role", PolicyName="MyPolicy", PolicyDocument=json.dumps(policy_document)
    )
```

- [ ] **Step 2: Run tests to verify they fail**

Run (from `backend/`): `pytest tests/test_tools_actions.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.tools.actions'`

- [ ] **Step 3: Write minimal implementation** in `backend/app/tools/actions.py`

```python
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_tools_actions.py -v`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/app/tools/actions.py backend/tests/test_tools_actions.py
git commit -m "feat: add real AWS mutation functions for the three action tools"
```

---

## Task 2: SQLite-backed action store (`app/actions/store.py`)

**Files:**
- Create: `backend/app/actions/__init__.py`
- Create: `backend/app/actions/store.py`
- Test: `backend/tests/test_action_store.py`

**Interfaces:**
- Produces: `ActionStore(db_path: str = ":memory:")` with `create(agent_id, node_id, tool_name, params: dict) -> dict`, `get(action_id) -> dict | None`, `list() -> list[dict]`, `set_reasoning(action_id, reasoning: str) -> None`, `resolve(action_id, status: str, result: dict | None) -> dict`. Every returned record: `{"id": str, "agent_id": str, "node_id": str, "tool_name": str, "params": dict, "proposed_reasoning": str | None, "status": str, "created_at": str, "resolved_at": str | None, "result": dict | None}`.

- [ ] **Step 1: Create `backend/app/actions/__init__.py`** (empty file)

- [ ] **Step 2: Write the failing tests** in `backend/tests/test_action_store.py`

```python
from app.actions.store import ActionStore


def test_create_returns_pending_record_with_decoded_params():
    store = ActionStore(":memory:")

    action = store.create(
        agent_id="cost", node_id="ec2:i-1", tool_name="stop_ec2_instance", params={"instance_id": "i-1"}
    )

    assert action["agent_id"] == "cost"
    assert action["node_id"] == "ec2:i-1"
    assert action["tool_name"] == "stop_ec2_instance"
    assert action["params"] == {"instance_id": "i-1"}
    assert action["status"] == "pending"
    assert action["proposed_reasoning"] is None
    assert action["resolved_at"] is None
    assert action["result"] is None
    assert isinstance(action["id"], str) and action["id"]
    assert isinstance(action["created_at"], str) and action["created_at"]


def test_get_returns_none_for_unknown_id():
    store = ActionStore(":memory:")

    assert store.get("does-not-exist") is None


def test_get_returns_previously_created_record():
    store = ActionStore(":memory:")
    created = store.create(
        agent_id="security", node_id="lambda:fn", tool_name="tighten_iam_policy", params={"role_name": "r"}
    )

    fetched = store.get(created["id"])

    assert fetched == created


def test_list_includes_all_created_records():
    store = ActionStore(":memory:")
    first = store.create(agent_id="cost", node_id="ec2:i-1", tool_name="stop_ec2_instance", params={})
    second = store.create(agent_id="performance", node_id="ec2:i-2", tool_name="resize_ec2_instance", params={})

    ids_in_list = {action["id"] for action in store.list()}

    assert first["id"] in ids_in_list
    assert second["id"] in ids_in_list


def test_set_reasoning_updates_the_record():
    store = ActionStore(":memory:")
    action = store.create(agent_id="cost", node_id="ec2:i-1", tool_name="stop_ec2_instance", params={})

    store.set_reasoning(action["id"], "Instance idle for 14 hours.")

    assert store.get(action["id"])["proposed_reasoning"] == "Instance idle for 14 hours."


def test_resolve_sets_status_resolved_at_and_result():
    store = ActionStore(":memory:")
    action = store.create(agent_id="cost", node_id="ec2:i-1", tool_name="stop_ec2_instance", params={})

    resolved = store.resolve(action["id"], status="approved", result={"success": True, "result": {}})

    assert resolved["status"] == "approved"
    assert resolved["result"] == {"success": True, "result": {}}
    assert isinstance(resolved["resolved_at"], str) and resolved["resolved_at"]


def test_resolve_with_none_result_stores_none():
    store = ActionStore(":memory:")
    action = store.create(agent_id="cost", node_id="ec2:i-1", tool_name="stop_ec2_instance", params={})

    resolved = store.resolve(action["id"], status="rejected", result=None)

    assert resolved["status"] == "rejected"
    assert resolved["result"] is None
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pytest tests/test_action_store.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.actions.store'`

- [ ] **Step 4: Write minimal implementation** in `backend/app/actions/store.py`

```python
import datetime
import json
import sqlite3
import uuid


class ActionStore:
    def __init__(self, db_path: str = ":memory:") -> None:
        self._conn = sqlite3.connect(db_path, check_same_thread=False)
        self._conn.execute(
            """
            CREATE TABLE IF NOT EXISTS pending_actions (
                id TEXT PRIMARY KEY,
                agent_id TEXT NOT NULL,
                node_id TEXT NOT NULL,
                tool_name TEXT NOT NULL,
                params TEXT NOT NULL,
                proposed_reasoning TEXT,
                status TEXT NOT NULL,
                created_at TEXT NOT NULL,
                resolved_at TEXT,
                result TEXT
            )
            """
        )
        self._conn.commit()

    def create(self, agent_id: str, node_id: str, tool_name: str, params: dict) -> dict:
        action_id = str(uuid.uuid4())
        created_at = datetime.datetime.utcnow().isoformat()
        self._conn.execute(
            "INSERT INTO pending_actions "
            "(id, agent_id, node_id, tool_name, params, proposed_reasoning, status, created_at, resolved_at, result) "
            "VALUES (?, ?, ?, ?, ?, NULL, 'pending', ?, NULL, NULL)",
            (action_id, agent_id, node_id, tool_name, json.dumps(params), created_at),
        )
        self._conn.commit()
        return self.get(action_id)

    def get(self, action_id: str) -> dict | None:
        row = self._conn.execute(
            "SELECT id, agent_id, node_id, tool_name, params, proposed_reasoning, status, "
            "created_at, resolved_at, result FROM pending_actions WHERE id = ?",
            (action_id,),
        ).fetchone()
        if row is None:
            return None
        return self._row_to_dict(row)

    def list(self) -> list[dict]:
        rows = self._conn.execute(
            "SELECT id, agent_id, node_id, tool_name, params, proposed_reasoning, status, "
            "created_at, resolved_at, result FROM pending_actions ORDER BY created_at DESC"
        ).fetchall()
        return [self._row_to_dict(row) for row in rows]

    def set_reasoning(self, action_id: str, reasoning: str) -> None:
        self._conn.execute(
            "UPDATE pending_actions SET proposed_reasoning = ? WHERE id = ?", (reasoning, action_id)
        )
        self._conn.commit()

    def resolve(self, action_id: str, status: str, result: dict | None) -> dict:
        resolved_at = datetime.datetime.utcnow().isoformat()
        self._conn.execute(
            "UPDATE pending_actions SET status = ?, resolved_at = ?, result = ? WHERE id = ?",
            (status, resolved_at, json.dumps(result) if result is not None else None, action_id),
        )
        self._conn.commit()
        return self.get(action_id)

    @staticmethod
    def _row_to_dict(row) -> dict:
        (
            id_,
            agent_id,
            node_id,
            tool_name,
            params,
            proposed_reasoning,
            status,
            created_at,
            resolved_at,
            result,
        ) = row
        return {
            "id": id_,
            "agent_id": agent_id,
            "node_id": node_id,
            "tool_name": tool_name,
            "params": json.loads(params),
            "proposed_reasoning": proposed_reasoning,
            "status": status,
            "created_at": created_at,
            "resolved_at": resolved_at,
            "result": json.loads(result) if result else None,
        }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pytest tests/test_action_store.py -v`
Expected: PASS (7 tests)

- [ ] **Step 6: Commit**

```bash
git add backend/app/actions/__init__.py backend/app/actions/store.py backend/tests/test_action_store.py
git commit -m "feat: add SQLite-backed action store"
```

---

## Task 3: Action proposal tool factory (`app/actions/proposals.py`)

**Files:**
- Create: `backend/app/actions/proposals.py`
- Test: `backend/tests/test_action_proposals.py`

**Interfaces:**
- Consumes: `ActionStore.create(agent_id, node_id, tool_name, params) -> dict` (Task 2).
- Produces: `propose_action(action_store, agent_id: str, node_id: str, tool_name: str, params: dict) -> dict`; `build_action_tool(action_store, agent_id: str, node_id: str, tool_name: str)` — returns a `**kwargs` callable.

- [ ] **Step 1: Write the failing tests** in `backend/tests/test_action_proposals.py`

```python
from app.actions.proposals import build_action_tool, propose_action
from app.actions.store import ActionStore


def test_propose_action_creates_pending_action_and_returns_message():
    store = ActionStore(":memory:")

    result = propose_action(store, "cost", "ec2:i-1", "stop_ec2_instance", {"instance_id": "i-1"})

    assert result["pending_action"]["agent_id"] == "cost"
    assert result["pending_action"]["node_id"] == "ec2:i-1"
    assert result["pending_action"]["tool_name"] == "stop_ec2_instance"
    assert result["pending_action"]["params"] == {"instance_id": "i-1"}
    assert result["pending_action"]["status"] == "pending"
    action_id = result["pending_action"]["id"]
    assert result["message"] == f"Proposed 'stop_ec2_instance' for human approval (action id {action_id})."


def test_propose_action_persists_to_the_store():
    store = ActionStore(":memory:")

    result = propose_action(store, "security", "lambda:fn", "tighten_iam_policy", {"role_name": "r"})

    assert store.get(result["pending_action"]["id"]) == result["pending_action"]


def test_build_action_tool_returns_callable_that_proposes_with_given_kwargs():
    store = ActionStore(":memory:")
    tool = build_action_tool(store, "performance", "ec2:i-2", "resize_ec2_instance")

    result = tool(instance_id="i-2", new_instance_type="t3.small")

    assert result["pending_action"]["agent_id"] == "performance"
    assert result["pending_action"]["node_id"] == "ec2:i-2"
    assert result["pending_action"]["tool_name"] == "resize_ec2_instance"
    assert result["pending_action"]["params"] == {"instance_id": "i-2", "new_instance_type": "t3.small"}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_action_proposals.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.actions.proposals'`

- [ ] **Step 3: Write minimal implementation** in `backend/app/actions/proposals.py`

```python
def propose_action(action_store, agent_id: str, node_id: str, tool_name: str, params: dict) -> dict:
    action = action_store.create(agent_id=agent_id, node_id=node_id, tool_name=tool_name, params=params)
    return {
        "pending_action": action,
        "message": f"Proposed '{tool_name}' for human approval (action id {action['id']}).",
    }


def build_action_tool(action_store, agent_id: str, node_id: str, tool_name: str):
    def action_tool(**kwargs) -> dict:
        return propose_action(action_store, agent_id, node_id, tool_name, kwargs)

    return action_tool
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_action_proposals.py -v`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/app/actions/proposals.py backend/tests/test_action_proposals.py
git commit -m "feat: add action proposal tool factory"
```

---

## Task 4: Action executor (`app/actions/executor.py`)

**Files:**
- Create: `backend/app/actions/executor.py`
- Test: `backend/tests/test_action_executor.py`

**Interfaces:**
- Consumes: `stop_ec2_instance`, `resize_ec2_instance`, `tighten_iam_policy` (Task 1).
- Produces: `EXECUTOR_DISPATCH: dict[str, callable]`; `execute_action(action: dict, client=None) -> dict` — `{"success": True, "result": ...}` or `{"success": False, "error": str}`.

- [ ] **Step 1: Write the failing tests** in `backend/tests/test_action_executor.py`

```python
from unittest.mock import patch

from app.actions.executor import execute_action


def test_execute_action_returns_success_with_result():
    action = {"tool_name": "stop_ec2_instance", "params": {"instance_id": "i-1"}}

    with patch("app.actions.executor.stop_ec2_instance", return_value={"instance_id": "i-1", "action": "stop"}) as mock_stop:
        outcome = execute_action(action, client="fake-client")

    assert outcome == {"success": True, "result": {"instance_id": "i-1", "action": "stop"}}
    mock_stop.assert_called_once_with(instance_id="i-1", client="fake-client")


def test_execute_action_returns_failure_when_executor_raises():
    action = {"tool_name": "resize_ec2_instance", "params": {"instance_id": "i-1", "new_instance_type": "t3.small"}}

    with patch("app.actions.executor.resize_ec2_instance", side_effect=RuntimeError("boto3 boom")):
        outcome = execute_action(action)

    assert outcome == {"success": False, "error": "boto3 boom"}


def test_execute_action_dispatches_tighten_iam_policy():
    action = {
        "tool_name": "tighten_iam_policy",
        "params": {"role_name": "r", "policy_name": "p", "new_policy_document": {"Statement": []}},
    }

    with patch(
        "app.actions.executor.tighten_iam_policy",
        return_value={"role_name": "r", "policy_name": "p", "action": "tighten_iam_policy"},
    ) as mock_tighten:
        outcome = execute_action(action)

    assert outcome["success"] is True
    mock_tighten.assert_called_once_with(
        role_name="r", policy_name="p", new_policy_document={"Statement": []}, client=None
    )
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_action_executor.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.actions.executor'`

- [ ] **Step 3: Write minimal implementation** in `backend/app/actions/executor.py`

```python
from app.tools.actions import resize_ec2_instance, stop_ec2_instance, tighten_iam_policy

EXECUTOR_DISPATCH = {
    "stop_ec2_instance": stop_ec2_instance,
    "resize_ec2_instance": resize_ec2_instance,
    "tighten_iam_policy": tighten_iam_policy,
}


def execute_action(action: dict, client=None) -> dict:
    executor = EXECUTOR_DISPATCH[action["tool_name"]]
    try:
        result = executor(**action["params"], client=client)
        return {"success": True, "result": result}
    except Exception as exc:
        return {"success": False, "error": str(exc)}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_action_executor.py -v`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/app/actions/executor.py backend/tests/test_action_executor.py
git commit -m "feat: add action executor dispatching to real AWS mutations"
```

---

## Task 5: Extend agent tool definitions with action tools

**Files:**
- Modify: `backend/app/agents/tools.py`
- Test: `backend/tests/test_agent_tools.py`

**Interfaces:**
- Produces: `ACTION_TOOL_NAMES = ["stop_ec2_instance", "resize_ec2_instance", "tighten_iam_policy"]`; `tool_subset(names)` now returns a `dispatch` dict containing only names present in `_ALL_TOOL_DISPATCH` (action tool names are never in it).

- [ ] **Step 1: Write the failing tests** (append to `backend/tests/test_agent_tools.py`)

```python
from app.agents.tools import ACTION_TOOL_NAMES


def test_action_tool_names_match_spec():
    assert ACTION_TOOL_NAMES == ["stop_ec2_instance", "resize_ec2_instance", "tighten_iam_policy"]


def test_tool_subset_definitions_include_action_tool_schemas():
    definitions, _ = tool_subset(ACTION_TOOL_NAMES)

    assert {d["name"] for d in definitions} == set(ACTION_TOOL_NAMES)
    for definition in definitions:
        assert "does not execute immediately" in definition["description"]


def test_tool_subset_dispatch_excludes_action_tools():
    _, dispatch = tool_subset(["stop_ec2_instance"])

    assert dispatch == {}


def test_tool_subset_mixed_read_and_action_names():
    definitions, dispatch = tool_subset(COST_TOOL_NAMES + ["stop_ec2_instance"])

    assert {d["name"] for d in definitions} == set(COST_TOOL_NAMES) | {"stop_ec2_instance"}
    assert set(dispatch.keys()) == set(COST_TOOL_NAMES)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_agent_tools.py -v`
Expected: FAIL with `ImportError: cannot import name 'ACTION_TOOL_NAMES' from 'app.agents.tools'`

- [ ] **Step 3: Modify `backend/app/agents/tools.py`** — add these definitions to `_ALL_TOOL_DEFINITIONS` (insert after the `"get_iam_policy_for_role"` entry, keeping the dict's closing brace) and add `ACTION_TOOL_NAMES` plus the updated `tool_subset`:

```python
ACTION_TOOL_NAMES = ["stop_ec2_instance", "resize_ec2_instance", "tighten_iam_policy"]
```

Add to `_ALL_TOOL_DEFINITIONS`:

```python
    "stop_ec2_instance": {
        "name": "stop_ec2_instance",
        "description": (
            "Propose stopping an EC2 instance. This does not execute immediately — it creates "
            "a pending action that requires human approval before AWS is actually called."
        ),
        "input_schema": {
            "type": "object",
            "properties": {"instance_id": {"type": "string"}},
            "required": ["instance_id"],
        },
    },
    "resize_ec2_instance": {
        "name": "resize_ec2_instance",
        "description": (
            "Propose resizing an EC2 instance to a new instance type. This does not execute "
            "immediately — it creates a pending action that requires human approval before AWS "
            "is actually called."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "instance_id": {"type": "string"},
                "new_instance_type": {"type": "string", "description": "e.g. t3.small"},
            },
            "required": ["instance_id", "new_instance_type"],
        },
    },
    "tighten_iam_policy": {
        "name": "tighten_iam_policy",
        "description": (
            "Propose replacing an IAM role's inline policy with a narrower policy document. "
            "This does not execute immediately — it creates a pending action that requires "
            "human approval before AWS is actually called."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "role_name": {"type": "string"},
                "policy_name": {"type": "string"},
                "new_policy_document": {
                    "type": "object",
                    "description": "The replacement IAM policy document",
                },
            },
            "required": ["role_name", "policy_name", "new_policy_document"],
        },
    },
```

Replace the existing `tool_subset` function with:

```python
def tool_subset(names: list[str]) -> tuple[list[dict], dict]:
    definitions = [_ALL_TOOL_DEFINITIONS[name] for name in names]
    dispatch = {name: _ALL_TOOL_DISPATCH[name] for name in names if name in _ALL_TOOL_DISPATCH}
    return definitions, dispatch
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_agent_tools.py -v`
Expected: PASS (10 tests — the 6 from Phase 3 plus 4 new ones)

- [ ] **Step 5: Commit**

```bash
git add backend/app/agents/tools.py backend/tests/test_agent_tools.py
git commit -m "feat: add action tool schemas and exclude them from static dispatch"
```

---

## Task 6: Modify `investigate_node` to collect proposed actions

**Files:**
- Modify: `backend/app/agents/investigate.py`
- Modify: `backend/tests/test_agent_investigate.py`

**Interfaces:**
- Produces: `investigate_node(node, investigation_focus, tool_definitions, tool_dispatch, client=None) -> tuple[str, list[dict]]` (was `-> str` in Phase 3).

- [ ] **Step 1: Replace the contents of `backend/tests/test_agent_investigate.py`** with the updated tests (existing 4 tests now unpack a tuple, plus one new test)

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

    text, proposed_actions = await investigate_node(node, "cost trends", [], {}, client=mock_client)

    assert text == "Cost looks stable."
    assert proposed_actions == []
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

    text, proposed_actions = await investigate_node(
        node, "performance issues", [], tool_dispatch, client=mock_client
    )

    assert text == "One function found, no issues."
    assert proposed_actions == []
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

    text, proposed_actions = await investigate_node(
        node, "IAM security risks", [], {"get_iam_policy_for_role": broken_tool}, client=mock_client
    )

    assert text == "Could not verify policy."
    assert proposed_actions == []


@pytest.mark.anyio
async def test_investigate_node_stops_after_max_iterations():
    mock_client = MagicMock()
    looping_response = MagicMock()
    looping_response.stop_reason = "tool_use"
    looping_response.content = [_tool_use_block("t1", "noop", {})]
    mock_client.messages.create.return_value = looping_response

    node = {"node_id": "ec2:i-1", "resource_type": "ec2", "name": "web"}

    text, proposed_actions = await investigate_node(
        node, "cost trends", [], {"noop": lambda: {}}, client=mock_client
    )

    assert text == "Investigation inconclusive after multiple tool calls."
    assert proposed_actions == []
    assert mock_client.messages.create.call_count == 5


@pytest.mark.anyio
async def test_investigate_node_collects_proposed_actions_from_tool_results():
    mock_client = MagicMock()

    tool_response = MagicMock()
    tool_response.stop_reason = "tool_use"
    tool_response.content = [_tool_use_block("t1", "stop_ec2_instance", {"instance_id": "i-1"})]

    final_response = MagicMock()
    final_response.stop_reason = "end_turn"
    final_response.content = [_text_block("Proposed stopping idle instance i-1.")]

    mock_client.messages.create.side_effect = [tool_response, final_response]

    pending_action = {"id": "action-1", "tool_name": "stop_ec2_instance", "params": {"instance_id": "i-1"}}
    tool_dispatch = {
        "stop_ec2_instance": lambda instance_id: {"pending_action": pending_action, "message": "proposed"}
    }

    node = {"node_id": "ec2:i-1", "resource_type": "ec2", "name": "web"}

    text, proposed_actions = await investigate_node(
        node, "cost trends", [], tool_dispatch, client=mock_client
    )

    assert text == "Proposed stopping idle instance i-1."
    assert proposed_actions == [pending_action]
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_agent_investigate.py -v`
Expected: FAIL — `investigate_node` still returns a plain string, so tuple unpacking (`text, proposed_actions = ...`) raises.

- [ ] **Step 3: Replace the contents of `backend/app/agents/investigate.py`**

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
) -> tuple[str, list[dict]]:
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
    proposed_actions: list[dict] = []

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
            text = "\n".join(block.text for block in response.content if block.type == "text")
            return text, proposed_actions

        tool_results = []
        for block in response.content:
            if block.type != "tool_use":
                continue
            try:
                result = tool_dispatch[block.name](**block.input)
                if isinstance(result, dict) and "pending_action" in result:
                    proposed_actions.append(result["pending_action"])
                content = json.dumps(result, default=str)
            except Exception as exc:
                content = json.dumps({"error": str(exc)})
            tool_results.append(
                {"type": "tool_result", "tool_use_id": block.id, "content": content}
            )
        messages.append({"role": "user", "content": tool_results})

    return FALLBACK_FINDING, proposed_actions
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_agent_investigate.py -v`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/app/agents/investigate.py backend/tests/test_agent_investigate.py
git commit -m "feat: collect proposed actions from the investigation loop"
```

---

## Task 7: Modify `AgentRunner` to bind action tools per-cycle

**Files:**
- Modify: `backend/app/agents/runner.py`
- Modify: `backend/tests/test_agent_runner.py`

**Interfaces:**
- Consumes: `build_action_tool` (Task 3); `investigate_node` returning `(text, proposed_actions)` (Task 6).
- Produces: `AgentRunner(..., action_tool_name: str | None = None, action_store=None)` — new optional constructor params, both default `None`.

- [ ] **Step 1: Replace the contents of `backend/tests/test_agent_runner.py`**

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
        return "Cost trending up 60%.", []

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
    assert broadcaster.broadcast.await_args_list[-1].args[0] == result


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
        return "finding", []

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


@pytest.mark.anyio
async def test_run_cycle_records_reasoning_and_broadcasts_action_proposed_before_finding():
    store = FakeStore({"ec2:i-1": {"node_id": "ec2:i-1", "resource_type": "ec2"}})
    broadcaster = AsyncMock()
    action_store = AsyncMock()
    proposed_action = {"id": "action-1", "tool_name": "stop_ec2_instance"}

    async def fake_investigate(node, focus, definitions, dispatch, client=None):
        return "Proposed stopping idle instance.", [proposed_action]

    runner = AgentRunner(
        agent_id="cost",
        store=store,
        broadcaster=broadcaster,
        select_node_fn=lambda nodes, history: "ec2:i-1",
        tool_definitions=[],
        tool_dispatch={},
        investigation_focus="cost trends",
        investigate_fn=fake_investigate,
        action_tool_name="stop_ec2_instance",
        action_store=action_store,
    )

    result = await runner.run_cycle()

    action_store.set_reasoning.assert_called_once_with("action-1", "Proposed stopping idle instance.")

    broadcast_types = [call.args[0]["type"] for call in broadcaster.broadcast.await_args_list]
    assert broadcast_types == ["agent_move", "action_proposed", "finding"]

    action_proposed_call = broadcaster.broadcast.await_args_list[1].args[0]
    assert action_proposed_call == {
        "type": "action_proposed",
        "agent_id": "cost",
        "node_id": "ec2:i-1",
        "action_id": "action-1",
    }
    assert result["text"] == "Proposed stopping idle instance."
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_agent_runner.py -v`
Expected: FAIL — `AgentRunner` doesn't accept `action_tool_name`/`action_store`, and `run_cycle` doesn't unpack a tuple from `investigate_fn`.

- [ ] **Step 3: Replace the contents of `backend/app/agents/runner.py`**

```python
import asyncio

from app.actions.proposals import build_action_tool
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
        action_tool_name: str | None = None,
        action_store=None,
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
        self.action_tool_name = action_tool_name
        self.action_store = action_store
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

        tool_dispatch = dict(self.tool_dispatch)
        if self.action_tool_name is not None:
            tool_dispatch[self.action_tool_name] = build_action_tool(
                self.action_store, self.agent_id, node_id, self.action_tool_name
            )

        text, proposed_actions = await self._investigate_fn(
            node, self.investigation_focus, self.tool_definitions, tool_dispatch, client=self.client
        )

        for action in proposed_actions:
            self.action_store.set_reasoning(action["id"], text)
            await self.broadcaster.broadcast(
                {
                    "type": "action_proposed",
                    "agent_id": self.agent_id,
                    "node_id": node_id,
                    "action_id": action["id"],
                }
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
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/app/agents/runner.py backend/tests/test_agent_runner.py
git commit -m "feat: bind action tools per-cycle and broadcast action_proposed"
```

---

## Task 8: Wire actions into `app/main.py`

**Files:**
- Modify: `backend/app/main.py`
- Modify: `.gitignore`
- Modify: `backend/tests/test_main.py`

**Interfaces:**
- Consumes: `ActionStore` (Task 2), `execute_action` (Task 4), `ACTION_TOOL_NAMES`/`tool_subset` (Task 5), `AgentRunner`'s new params (Task 7).
- Produces: `GET /actions`, `POST /actions/{action_id}/approve`, `POST /actions/{action_id}/reject`; module-level `action_store` importable from `app.main`.

- [ ] **Step 1: Add the SQLite runtime file to `.gitignore`** — append to the repo root `.gitignore`:

```
*.db
```

- [ ] **Step 2: Write the failing tests** (append to `backend/tests/test_main.py`)

```python
from app.actions.store import ActionStore


def test_agents_have_correct_action_tool_wired_in():
    from app.main import cost_agent, performance_agent, security_agent

    assert cost_agent.action_tool_name == "stop_ec2_instance"
    assert "stop_ec2_instance" in {d["name"] for d in cost_agent.tool_definitions}

    assert performance_agent.action_tool_name == "resize_ec2_instance"
    assert "resize_ec2_instance" in {d["name"] for d in performance_agent.tool_definitions}

    assert security_agent.action_tool_name == "tighten_iam_policy"
    assert "tighten_iam_policy" in {d["name"] for d in security_agent.tool_definitions}


def test_list_actions_includes_seeded_record():
    from app.main import action_store

    seeded = action_store.create(
        agent_id="cost", node_id="ec2:i-1", tool_name="stop_ec2_instance", params={"instance_id": "i-1"}
    )

    response = client.get("/actions")

    assert response.status_code == 200
    ids_in_response = {a["id"] for a in response.json()}
    assert seeded["id"] in ids_in_response


def test_approve_action_executes_and_resolves():
    from app.main import action_store

    seeded = action_store.create(
        agent_id="cost", node_id="ec2:i-1", tool_name="stop_ec2_instance", params={"instance_id": "i-1"}
    )
    fake_outcome = {"success": True, "result": {"instance_id": "i-1", "action": "stop"}}

    with patch("app.main.execute_action", return_value=fake_outcome) as mock_execute:
        response = client.post(f"/actions/{seeded['id']}/approve")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "approved"
    assert body["result"] == fake_outcome
    mock_execute.assert_called_once()
    assert action_store.get(seeded["id"])["status"] == "approved"


def test_approve_action_returns_404_for_unknown_id():
    response = client.post("/actions/does-not-exist/approve")

    assert response.status_code == 404


def test_approve_action_returns_409_when_already_resolved():
    from app.main import action_store

    seeded = action_store.create(
        agent_id="cost", node_id="ec2:i-1", tool_name="stop_ec2_instance", params={"instance_id": "i-1"}
    )
    action_store.resolve(seeded["id"], status="rejected", result=None)

    response = client.post(f"/actions/{seeded['id']}/approve")

    assert response.status_code == 409


def test_reject_action_resolves_without_executing():
    from app.main import action_store

    seeded = action_store.create(
        agent_id="security", node_id="lambda:fn", tool_name="tighten_iam_policy", params={"role_name": "r"}
    )

    with patch("app.main.execute_action") as mock_execute:
        response = client.post(f"/actions/{seeded['id']}/reject")

    assert response.status_code == 200
    assert response.json()["status"] == "rejected"
    mock_execute.assert_not_called()
    assert action_store.get(seeded["id"])["status"] == "rejected"
```

Add the missing import at the top of `backend/tests/test_main.py`:

```python
from unittest.mock import patch
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pytest tests/test_main.py -v`
Expected: FAIL — `action_store`, `/actions`, `/actions/{id}/approve`, `/actions/{id}/reject` don't exist yet; `cost_agent.action_tool_name` is `None`.

- [ ] **Step 4: Replace the contents of `backend/app/main.py`**

```python
import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect

from app.actions.executor import execute_action
from app.actions.store import ActionStore
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
action_store = ActionStore(db_path="cloudsentry_actions.db")

cost_tool_definitions, cost_tool_dispatch = tool_subset(COST_TOOL_NAMES + ["stop_ec2_instance"])
performance_tool_definitions, performance_tool_dispatch = tool_subset(
    PERFORMANCE_TOOL_NAMES + ["resize_ec2_instance"]
)
security_tool_definitions, security_tool_dispatch = tool_subset(
    SECURITY_TOOL_NAMES + ["tighten_iam_policy"]
)

cost_agent = AgentRunner(
    agent_id="cost",
    store=graph_store,
    broadcaster=connection_manager,
    select_node_fn=select_cost_node,
    tool_definitions=cost_tool_definitions,
    tool_dispatch=cost_tool_dispatch,
    investigation_focus="cost trends",
    action_tool_name="stop_ec2_instance",
    action_store=action_store,
)
performance_agent = AgentRunner(
    agent_id="performance",
    store=graph_store,
    broadcaster=connection_manager,
    select_node_fn=select_performance_node,
    tool_definitions=performance_tool_definitions,
    tool_dispatch=performance_tool_dispatch,
    investigation_focus="performance and latency issues",
    action_tool_name="resize_ec2_instance",
    action_store=action_store,
)
security_agent = AgentRunner(
    agent_id="security",
    store=graph_store,
    broadcaster=connection_manager,
    select_node_fn=select_security_node,
    tool_definitions=security_tool_definitions,
    tool_dispatch=security_tool_dispatch,
    investigation_focus="IAM security risks such as overly broad permissions",
    action_tool_name="tighten_iam_policy",
    action_store=action_store,
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


@app.get("/actions")
def list_actions():
    return action_store.list()


@app.post("/actions/{action_id}/approve")
async def approve_action(action_id: str):
    action = action_store.get(action_id)
    if action is None:
        raise HTTPException(status_code=404, detail="Action not found")
    if action["status"] != "pending":
        raise HTTPException(status_code=409, detail=f"Action already {action['status']}")

    outcome = execute_action(action)
    resolved = action_store.resolve(action_id, status="approved", result=outcome)

    await connection_manager.broadcast(
        {"type": "action_resolved", "action_id": action_id, "status": resolved["status"]}
    )
    return resolved


@app.post("/actions/{action_id}/reject")
async def reject_action(action_id: str):
    action = action_store.get(action_id)
    if action is None:
        raise HTTPException(status_code=404, detail="Action not found")
    if action["status"] != "pending":
        raise HTTPException(status_code=409, detail=f"Action already {action['status']}")

    resolved = action_store.resolve(action_id, status="rejected", result=None)

    await connection_manager.broadcast(
        {"type": "action_resolved", "action_id": action_id, "status": resolved["status"]}
    )
    return resolved
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pytest tests/test_main.py -v`
Expected: PASS (9 tests: the 4 from Phase 3 plus 5 new ones)

- [ ] **Step 6: Commit**

```bash
git add backend/app/main.py backend/tests/test_main.py .gitignore
git commit -m "feat: wire action tools into agents and add /actions approve/reject routes"
```

---

## Task 9: Full-suite verification + manual live verification (with the user present)

**Files:** none created; this task verifies the assembled system.

- [ ] **Step 1: Run the full backend test suite**

Run (from `backend/`): `pytest -v`
Expected: All tests across every module in this plan (plus everything from Phases 1–3) PASS, fully mocked — no real AWS or Anthropic calls made.

- [ ] **Step 2: Manual live verification — requires the user to be present**

This step is not something to run unattended or with a guessed target: approving a pending action performs a **real** AWS mutation (stopping a real EC2 instance, resizing one, or rewriting a real IAM role's inline policy). Do not execute it as part of an automated task run. When the user is available:

1. Start the real server with both AWS and Anthropic credentials, e.g. `ANTHROPIC_API_KEY=<key> AWS_PROFILE=ops-agent AWS_DEFAULT_REGION=us-east-1 uvicorn app.main:app --port 8000`.
2. Let it run long enough for an agent to produce a finding that also proposes an action (the Security agent is the fastest to act, per Phase 3's verification notes — round-robin, no baseline cycle needed).
3. Run `curl -s http://localhost:8000/actions | python3 -m json.tool` and confirm the proposed action's `tool_name`, `params`, and `proposed_reasoning` look sensible for a real resource in the account.
4. **With the user reviewing the specific `instance_id`/`role_name` in the proposal and confirming it's safe to act on**, run either `curl -s -X POST http://localhost:8000/actions/<id>/approve` or `.../reject`.
5. Confirm the WebSocket listener (reused from Phase 2/3's manual checks) receives an `action_resolved` event, and — for an approval — verify the real AWS-side effect in the AWS console or via a follow-up `describe_instances`/`get_role_policy` call.
6. Stop the server.

- [ ] **Step 3: Commit** (only if Step 1 required any fixes)

```bash
git add -A
git commit -m "test: verify Phase 4 action/approval subsystem end-to-end"
```

---

## Self-Review Notes

- **Spec coverage:** The `PendingAction` shape and lifecycle from spec §4.4 (`{id, node_id, agent_id, tool_name, params, proposed_reasoning, status, created_at}` plus the implied `resolved_at`/`result` for recording outcomes) is covered by Task 2. "Action tools never call AWS directly when invoked by the agent... a separate, explicit execute call... does the real AWS mutation" is covered by Tasks 1, 3, and 4. `POST /actions/{id}/approve` and `POST /actions/{id}/reject`, and `GET /actions` as a full audit trail, are covered by Task 8. The three action tools from spec §4.1 are covered by Task 1 (real mutation) and Task 5 (Claude-facing schema). `action_proposed`/`action_resolved` events are covered by Tasks 7 and 8.
- **Out of scope confirmed absent:** no frontend action cards — that's Phase 5. No changes to `backend/app/tools/{cloudwatch,compute,cost_explorer,iam}.py`.
- **Type consistency:** `AgentRunner.run_cycle()` (Task 7) calls `self._investigate_fn(...)` and unpacks `(text, proposed_actions)`, matching `investigate_node`'s exact new return shape from Task 6. `build_action_tool(self.action_store, self.agent_id, node_id, self.action_tool_name)` (Task 7) matches Task 3's exact signature. `app.main`'s `AgentRunner(...)` constructions (Task 8) use the exact `action_tool_name=`/`action_store=` keyword arguments Task 7 added. `execute_action(action)` (Task 8's approve route) matches Task 4's exact signature, and `EXECUTOR_DISPATCH` (Task 4) references the exact function names exported by Task 1.
</content>
