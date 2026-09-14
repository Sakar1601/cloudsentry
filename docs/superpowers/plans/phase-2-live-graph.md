# Phase 2 — Live Graph Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stream live graph changes over `WS /graph/stream`, driven by a background poller that periodically rebuilds the graph and diffs it against the last known state, plus a standalone Traffic Generator script that produces real Lambda invocations so there's genuine activity to react to.

**Architecture:** A `GraphStore` holds the latest graph snapshot in memory. A `GraphPoller` runs on a fixed interval, calls Phase 1's `build_graph()`, diffs the result against the store via a pure `diff_graphs()` function, updates the store, and pushes each delta event through a `ConnectionManager` to every connected WebSocket client. `GET /graph` now serves the store's snapshot (no longer calling `build_graph()` per-request), and `WS /graph/stream` carries only deltas — clients get the full graph once via `GET /graph` on connect, then subscribe to the stream. The poller is started as a background task via FastAPI's lifespan context manager, so it only ever runs against real AWS when the app is actually served — never during unit tests. A separate `backend/scripts/traffic_generator.py` invokes real Lambda functions on a loop, outside the API process entirely.

**Tech Stack:** Python 3.11+, FastAPI (WebSocket support + lifespan), boto3, pytest, the `anyio` pytest plugin (already a transitive dependency via FastAPI/Starlette) for async tests, `unittest.mock` (`AsyncMock` for async collaborators).

**Spec:** `docs/spec.md` (sections 4.2 Graph Builder, 4.5 Graph API, 4.6 Traffic Generator, 7 Phase 2)

## Global Constraints

- No test may make a real AWS call or a real network connection to a live server — every unit test mocks the graph builder, the store, or the broadcaster.
- The poller interval defaults to 30 seconds (spec §4.2).
- WS clients never re-fetch the full graph except on first connect — `GET /graph` serves the snapshot, `WS /graph/stream` carries deltas only (spec §4.2, §4.5).
- The Traffic Generator never writes synthetic data directly to AWS — only real invocations (spec §4.6).
- Out of scope for this phase: the agent swarm, action tools, `PendingAction`/SQLite, the frontend — all Phase 3+.
- `backend/app/graph/builder.py`'s `build_graph(clients=None)` from Phase 1 is not modified in this phase.

## Design Notes (Phase 2 scoping decisions)

- **Lifespan-triggered background polling is verified only by the manual smoke test (last task), never by a unit test.** `TestClient(app)` used the plain way (`client = TestClient(app)`, as every existing test does) does not trigger FastAPI's lifespan — only `with TestClient(app) as client:` does. No test in this plan uses the `with` form, so the real poller (which would call real boto3) never runs during `pytest`.
- **`GraphStore.get()` does not deep-copy.** Callers must treat the returned dict as read-only. Fine for Phase 2's single-writer (the poller), many-reader (HTTP/WS handlers) pattern; revisit only if concurrent mutation becomes a real risk.
- **`run_loop` in the Traffic Generator streams results through an `on_result` callback instead of returning an accumulated list.** A real, unbounded run (`iterations=None`) would otherwise grow that list forever.

---

## File Structure

- `backend/tests/conftest.py` — `anyio_backend` fixture (pins async tests to asyncio, not trio).
- `backend/app/graph/diff.py` — `diff_graphs(old_graph, new_graph) -> list[dict]`.
- `backend/app/graph/store.py` — `GraphStore` (`get()`, `set()`).
- `backend/app/graph/broadcast.py` — `ConnectionManager` (`connect()`, `disconnect()`, `broadcast()`).
- `backend/app/graph/poller.py` — `GraphPoller` (`poll_once()`, `run_forever()`).
- `backend/app/main.py` — modified: `GET /graph` serves the store; new `WS /graph/stream`; lifespan starts the poller.
- `backend/scripts/__init__.py` — empty package marker.
- `backend/scripts/traffic_generator.py` — `invoke_once`, `run_loop`, `main`.
- `backend/tests/test_diff.py`, `test_store.py`, `test_broadcast.py`, `test_poller.py`, `test_main.py` (extended), `test_traffic_generator.py`.

---

## Task 1: Graph diffing (`diff_graphs`)

**Files:**
- Create: `backend/app/graph/diff.py`
- Test: `backend/tests/test_diff.py`

**Interfaces:**
- Consumes: graph shape `{"nodes": dict[str, dict], "edges": list[dict]}` produced by `build_graph` (Phase 1, `backend/app/graph/builder.py`).
- Produces: `diff_graphs(old_graph: dict, new_graph: dict) -> list[dict]` — each event shaped `{"type": "node_added" | "node_updated", "node": dict}`, `{"type": "node_removed", "node_id": str}`, or `{"type": "edge_added" | "edge_removed", "edge": dict}`.

- [ ] **Step 1: Write the failing tests** in `backend/tests/test_diff.py`

```python
from app.graph.diff import diff_graphs


def test_diff_graphs_detects_added_node():
    old_graph = {"nodes": {}, "edges": []}
    new_node = {"node_id": "ec2:i-1", "resource_type": "ec2", "state": "running"}
    new_graph = {"nodes": {"ec2:i-1": new_node}, "edges": []}

    events = diff_graphs(old_graph, new_graph)

    assert events == [{"type": "node_added", "node": new_node}]


def test_diff_graphs_detects_removed_node():
    old_node = {"node_id": "ec2:i-1", "resource_type": "ec2", "state": "running"}
    old_graph = {"nodes": {"ec2:i-1": old_node}, "edges": []}
    new_graph = {"nodes": {}, "edges": []}

    events = diff_graphs(old_graph, new_graph)

    assert events == [{"type": "node_removed", "node_id": "ec2:i-1"}]


def test_diff_graphs_detects_updated_node():
    old_graph = {
        "nodes": {"ec2:i-1": {"node_id": "ec2:i-1", "resource_type": "ec2", "state": "running"}},
        "edges": [],
    }
    updated_node = {"node_id": "ec2:i-1", "resource_type": "ec2", "state": "stopped"}
    new_graph = {"nodes": {"ec2:i-1": updated_node}, "edges": []}

    events = diff_graphs(old_graph, new_graph)

    assert events == [{"type": "node_updated", "node": updated_node}]


def test_diff_graphs_ignores_unchanged_node():
    node = {"node_id": "ec2:i-1", "resource_type": "ec2", "state": "running"}
    old_graph = {"nodes": {"ec2:i-1": node}, "edges": []}
    new_graph = {"nodes": {"ec2:i-1": dict(node)}, "edges": []}

    assert diff_graphs(old_graph, new_graph) == []


def test_diff_graphs_detects_added_edge():
    old_graph = {"nodes": {}, "edges": []}
    edge = {"source": "lambda:fn", "target": "dynamodb:t", "relation": "references"}
    new_graph = {"nodes": {}, "edges": [edge]}

    events = diff_graphs(old_graph, new_graph)

    assert events == [{"type": "edge_added", "edge": edge}]


def test_diff_graphs_detects_removed_edge():
    edge = {"source": "lambda:fn", "target": "dynamodb:t", "relation": "references"}
    old_graph = {"nodes": {}, "edges": [edge]}
    new_graph = {"nodes": {}, "edges": []}

    events = diff_graphs(old_graph, new_graph)

    assert events == [{"type": "edge_removed", "edge": edge}]


def test_diff_graphs_ignores_unchanged_edge():
    edge = {"source": "lambda:fn", "target": "dynamodb:t", "relation": "references"}
    old_graph = {"nodes": {}, "edges": [edge]}
    new_graph = {"nodes": {}, "edges": [dict(edge)]}

    assert diff_graphs(old_graph, new_graph) == []


def test_diff_graphs_bootstraps_from_empty_old_graph():
    node = {"node_id": "ec2:i-1", "resource_type": "ec2", "state": "running"}
    edge = {"source": "lambda:fn", "target": "dynamodb:t", "relation": "references"}
    old_graph = {"nodes": {}, "edges": []}
    new_graph = {"nodes": {"ec2:i-1": node}, "edges": [edge]}

    events = diff_graphs(old_graph, new_graph)

    assert {"type": "node_added", "node": node} in events
    assert {"type": "edge_added", "edge": edge} in events
    assert len(events) == 2
```

- [ ] **Step 2: Run tests to verify they fail**

Run (from `backend/`): `pytest tests/test_diff.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.graph.diff'`

- [ ] **Step 3: Write minimal implementation** in `backend/app/graph/diff.py`

```python
def diff_graphs(old_graph: dict, new_graph: dict) -> list[dict]:
    events: list[dict] = []

    old_nodes = old_graph.get("nodes", {})
    new_nodes = new_graph.get("nodes", {})

    for node_id, node in new_nodes.items():
        if node_id not in old_nodes:
            events.append({"type": "node_added", "node": node})
        elif old_nodes[node_id] != node:
            events.append({"type": "node_updated", "node": node})

    for node_id in old_nodes:
        if node_id not in new_nodes:
            events.append({"type": "node_removed", "node_id": node_id})

    old_edges_by_key = {_edge_key(e): e for e in old_graph.get("edges", [])}
    new_edges_by_key = {_edge_key(e): e for e in new_graph.get("edges", [])}

    for key, edge in new_edges_by_key.items():
        if key not in old_edges_by_key:
            events.append({"type": "edge_added", "edge": edge})

    for key, edge in old_edges_by_key.items():
        if key not in new_edges_by_key:
            events.append({"type": "edge_removed", "edge": edge})

    return events


def _edge_key(edge: dict) -> tuple:
    return (edge["source"], edge["target"], edge["relation"])
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_diff.py -v`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/app/graph/diff.py backend/tests/test_diff.py
git commit -m "feat: add graph snapshot diffing"
```

---

## Task 2: In-memory graph store (`GraphStore`)

**Files:**
- Create: `backend/app/graph/store.py`
- Test: `backend/tests/test_store.py`

**Interfaces:**
- Produces: `GraphStore` with `get() -> dict` and `set(graph: dict) -> None`. Starts as `{"nodes": {}, "edges": []}`.

- [ ] **Step 1: Write the failing tests** in `backend/tests/test_store.py`

```python
from app.graph.store import GraphStore


def test_graph_store_starts_empty():
    store = GraphStore()

    assert store.get() == {"nodes": {}, "edges": []}


def test_graph_store_set_then_get_returns_latest():
    store = GraphStore()
    graph = {"nodes": {"ec2:i-1": {"node_id": "ec2:i-1"}}, "edges": []}

    store.set(graph)

    assert store.get() == graph


def test_graph_store_set_overwrites_previous_value():
    store = GraphStore()
    store.set({"nodes": {"ec2:i-1": {"node_id": "ec2:i-1"}}, "edges": []})

    store.set({"nodes": {}, "edges": []})

    assert store.get() == {"nodes": {}, "edges": []}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_store.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.graph.store'`

- [ ] **Step 3: Write minimal implementation** in `backend/app/graph/store.py`

```python
class GraphStore:
    def __init__(self) -> None:
        self._graph: dict = {"nodes": {}, "edges": []}

    def get(self) -> dict:
        return self._graph

    def set(self, graph: dict) -> None:
        self._graph = graph
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_store.py -v`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/app/graph/store.py backend/tests/test_store.py
git commit -m "feat: add in-memory graph store"
```

---

## Task 3: WebSocket connection manager (`ConnectionManager`)

**Files:**
- Create: `backend/tests/conftest.py`
- Create: `backend/app/graph/broadcast.py`
- Test: `backend/tests/test_broadcast.py`

**Interfaces:**
- Produces: `ConnectionManager` with `connections: list`, `async connect(websocket) -> None`, `disconnect(websocket) -> None`, `async broadcast(event: dict) -> None`.

- [ ] **Step 1: Write `backend/tests/conftest.py`**

```python
import pytest


@pytest.fixture
def anyio_backend():
    return "asyncio"
```

- [ ] **Step 2: Write the failing tests** in `backend/tests/test_broadcast.py`

```python
from unittest.mock import AsyncMock

import pytest

from app.graph.broadcast import ConnectionManager


@pytest.mark.anyio
async def test_connect_accepts_and_registers_websocket():
    manager = ConnectionManager()
    websocket = AsyncMock()

    await manager.connect(websocket)

    websocket.accept.assert_awaited_once()
    assert websocket in manager.connections


def test_disconnect_removes_registered_websocket():
    manager = ConnectionManager()
    websocket = AsyncMock()
    manager.connections.append(websocket)

    manager.disconnect(websocket)

    assert websocket not in manager.connections


def test_disconnect_is_a_noop_for_unknown_websocket():
    manager = ConnectionManager()
    websocket = AsyncMock()

    manager.disconnect(websocket)


@pytest.mark.anyio
async def test_broadcast_sends_event_to_all_connections():
    manager = ConnectionManager()
    ws1 = AsyncMock()
    ws2 = AsyncMock()
    manager.connections.extend([ws1, ws2])
    event = {"type": "node_added", "node": {"node_id": "ec2:i-1"}}

    await manager.broadcast(event)

    ws1.send_json.assert_awaited_once_with(event)
    ws2.send_json.assert_awaited_once_with(event)


@pytest.mark.anyio
async def test_broadcast_drops_connections_that_error():
    manager = ConnectionManager()
    good = AsyncMock()
    bad = AsyncMock()
    bad.send_json.side_effect = RuntimeError("connection closed")
    manager.connections.extend([good, bad])

    await manager.broadcast({"type": "node_added", "node": {}})

    assert bad not in manager.connections
    assert good in manager.connections
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pytest tests/test_broadcast.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.graph.broadcast'`

- [ ] **Step 4: Write minimal implementation** in `backend/app/graph/broadcast.py`

```python
class ConnectionManager:
    def __init__(self) -> None:
        self.connections: list = []

    async def connect(self, websocket) -> None:
        await websocket.accept()
        self.connections.append(websocket)

    def disconnect(self, websocket) -> None:
        if websocket in self.connections:
            self.connections.remove(websocket)

    async def broadcast(self, event: dict) -> None:
        stale = []
        for connection in self.connections:
            try:
                await connection.send_json(event)
            except Exception:
                stale.append(connection)
        for connection in stale:
            self.disconnect(connection)
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pytest tests/test_broadcast.py -v`
Expected: PASS (5 tests)

- [ ] **Step 6: Commit**

```bash
git add backend/tests/conftest.py backend/app/graph/broadcast.py backend/tests/test_broadcast.py
git commit -m "feat: add WebSocket connection manager"
```

---

## Task 4: Graph poller (`GraphPoller`)

**Files:**
- Create: `backend/app/graph/poller.py`
- Test: `backend/tests/test_poller.py`

**Interfaces:**
- Consumes: `diff_graphs(old_graph, new_graph) -> list[dict]` (Task 1); a store object exposing `get()`/`set()` (Task 2, `GraphStore`); a broadcaster object exposing `async broadcast(event)` (Task 3, `ConnectionManager`); `build_graph(clients) -> dict` (Phase 1, `app.graph.builder`) as the default `build_graph_fn`.
- Produces: `GraphPoller(store, broadcaster, clients: dict | None = None, interval_seconds: float = 30.0, build_graph_fn=build_graph)` with `async poll_once() -> list[dict]` (returns the events it broadcast) and `async run_forever(iterations: int | None = None) -> None` (loops forever when `iterations` is `None`; otherwise runs exactly that many poll cycles, useful for tests).

- [ ] **Step 1: Write the failing tests** in `backend/tests/test_poller.py`

```python
from unittest.mock import AsyncMock

import pytest

from app.graph.poller import GraphPoller


class FakeStore:
    def __init__(self, initial: dict):
        self._graph = initial

    def get(self) -> dict:
        return self._graph

    def set(self, graph: dict) -> None:
        self._graph = graph


@pytest.mark.anyio
async def test_poll_once_diffs_broadcasts_and_updates_store():
    old_graph = {"nodes": {}, "edges": []}
    new_node = {"node_id": "ec2:i-1", "resource_type": "ec2"}
    new_graph = {"nodes": {"ec2:i-1": new_node}, "edges": []}
    store = FakeStore(old_graph)
    broadcaster = AsyncMock()

    poller = GraphPoller(
        store=store,
        broadcaster=broadcaster,
        build_graph_fn=lambda clients: new_graph,
    )

    events = await poller.poll_once()

    assert events == [{"type": "node_added", "node": new_node}]
    broadcaster.broadcast.assert_awaited_once_with(events[0])
    assert store.get() == new_graph


@pytest.mark.anyio
async def test_poll_once_broadcasts_nothing_when_graph_unchanged():
    graph = {"nodes": {}, "edges": []}
    store = FakeStore(graph)
    broadcaster = AsyncMock()

    poller = GraphPoller(store=store, broadcaster=broadcaster, build_graph_fn=lambda clients: graph)

    events = await poller.poll_once()

    assert events == []
    broadcaster.broadcast.assert_not_awaited()


@pytest.mark.anyio
async def test_poll_once_passes_clients_through_to_build_graph_fn():
    store = FakeStore({"nodes": {}, "edges": []})
    broadcaster = AsyncMock()
    received_clients = []

    def fake_build_graph(clients):
        received_clients.append(clients)
        return {"nodes": {}, "edges": []}

    poller = GraphPoller(
        store=store,
        broadcaster=broadcaster,
        clients={"ec2": "fake-ec2-client"},
        build_graph_fn=fake_build_graph,
    )

    await poller.poll_once()

    assert received_clients == [{"ec2": "fake-ec2-client"}]


@pytest.mark.anyio
async def test_run_forever_polls_the_requested_number_of_times():
    store = FakeStore({"nodes": {}, "edges": []})
    broadcaster = AsyncMock()
    call_count = 0

    def fake_build_graph(clients):
        nonlocal call_count
        call_count += 1
        return {"nodes": {}, "edges": []}

    poller = GraphPoller(
        store=store,
        broadcaster=broadcaster,
        build_graph_fn=fake_build_graph,
        interval_seconds=0,
    )

    await poller.run_forever(iterations=3)

    assert call_count == 3
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_poller.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.graph.poller'`

- [ ] **Step 3: Write minimal implementation** in `backend/app/graph/poller.py`

```python
import asyncio

from app.graph.builder import build_graph
from app.graph.diff import diff_graphs


class GraphPoller:
    def __init__(
        self,
        store,
        broadcaster,
        clients: dict | None = None,
        interval_seconds: float = 30.0,
        build_graph_fn=build_graph,
    ) -> None:
        self.store = store
        self.broadcaster = broadcaster
        self.clients = clients
        self.interval_seconds = interval_seconds
        self._build_graph_fn = build_graph_fn

    async def poll_once(self) -> list[dict]:
        old_graph = self.store.get()
        new_graph = await asyncio.to_thread(self._build_graph_fn, self.clients)
        events = diff_graphs(old_graph, new_graph)
        self.store.set(new_graph)
        for event in events:
            await self.broadcaster.broadcast(event)
        return events

    async def run_forever(self, iterations: int | None = None) -> None:
        count = 0
        while iterations is None or count < iterations:
            await self.poll_once()
            count += 1
            if iterations is None or count < iterations:
                await asyncio.sleep(self.interval_seconds)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_poller.py -v`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/app/graph/poller.py backend/tests/test_poller.py
git commit -m "feat: add background graph poller"
```

---

## Task 5: Wire `GET /graph`, `WS /graph/stream`, and the lifespan-started poller

**Files:**
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_main.py`

**Interfaces:**
- Consumes: `GraphStore` (Task 2), `ConnectionManager` (Task 3), `GraphPoller` (Task 4).
- Produces: `GET /graph` returning `graph_store.get()`; `WS /graph/stream` registering/unregistering connections via `connection_manager`; app-level singletons `graph_store` and `connection_manager` importable from `app.main`.

- [ ] **Step 1: Write the failing tests** (replace the `test_get_graph_returns_builder_output` test and append a WebSocket test in `backend/tests/test_main.py`)

Remove the old Phase 1 test that patched `app.main.build_graph` (that function is no longer imported by `app.main`):

```python
def test_get_graph_returns_builder_output():
    ...
```

Replace the full file contents with:

```python
from fastapi.testclient import TestClient

from app.main import app, connection_manager, graph_store

client = TestClient(app)


def test_health_returns_ok():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_get_graph_returns_current_store_state():
    fake_graph = {
        "nodes": {"ec2:i-1": {"node_id": "ec2:i-1", "resource_type": "ec2"}},
        "edges": [],
    }
    graph_store.set(fake_graph)

    response = client.get("/graph")

    assert response.status_code == 200
    assert response.json() == fake_graph


def test_graph_stream_registers_and_unregisters_connection():
    with client.websocket_connect("/graph/stream") as websocket:
        assert len(connection_manager.connections) == 1

    assert len(connection_manager.connections) == 0
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_main.py -v`
Expected: FAIL — `graph_store` and `connection_manager` don't exist in `app.main` yet, and `/graph/stream` doesn't exist (404/connection error).

- [ ] **Step 3: Write minimal implementation** — replace the contents of `backend/app/main.py`

```python
import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect

from app.graph.broadcast import ConnectionManager
from app.graph.poller import GraphPoller
from app.graph.store import GraphStore

graph_store = GraphStore()
connection_manager = ConnectionManager()
graph_poller = GraphPoller(store=graph_store, broadcaster=connection_manager)


@asynccontextmanager
async def lifespan(app: FastAPI):
    poller_task = asyncio.create_task(graph_poller.run_forever())
    yield
    poller_task.cancel()


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
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/app/main.py backend/tests/test_main.py
git commit -m "feat: serve graph from the store and add WS /graph/stream"
```

---

## Task 6: Traffic Generator script

**Files:**
- Create: `backend/scripts/__init__.py`
- Create: `backend/scripts/traffic_generator.py`
- Test: `backend/tests/test_traffic_generator.py`

**Interfaces:**
- Produces: `invoke_once(function_name: str, client=None) -> dict` (shape `{"function_name": str, "status_code": int}`); `run_loop(function_names: list[str], interval_seconds: float, client=None, iterations: int | None = None, on_result=None) -> None`; `main() -> None` (CLI entrypoint, not unit tested).

- [ ] **Step 1: Create `backend/scripts/__init__.py`** (empty file)

- [ ] **Step 2: Write the failing tests** in `backend/tests/test_traffic_generator.py`

```python
from unittest.mock import MagicMock, patch

from scripts.traffic_generator import invoke_once, run_loop


def test_invoke_once_calls_lambda_invoke_and_returns_status():
    mock_client = MagicMock()
    mock_client.invoke.return_value = {"StatusCode": 200}

    result = invoke_once("my-service", client=mock_client)

    assert result == {"function_name": "my-service", "status_code": 200}
    mock_client.invoke.assert_called_once_with(
        FunctionName="my-service", InvocationType="RequestResponse", Payload=b"{}"
    )


def test_run_loop_invokes_each_function_per_round_for_requested_iterations():
    mock_client = MagicMock()
    mock_client.invoke.return_value = {"StatusCode": 200}
    results = []

    with patch("scripts.traffic_generator.time.sleep") as mock_sleep:
        run_loop(
            ["fn-a", "fn-b"],
            interval_seconds=5.0,
            client=mock_client,
            iterations=2,
            on_result=results.append,
        )

    assert len(results) == 4
    assert [r["function_name"] for r in results] == ["fn-a", "fn-b", "fn-a", "fn-b"]
    assert mock_sleep.call_count == 1


def test_run_loop_does_not_sleep_after_the_final_round():
    mock_client = MagicMock()
    mock_client.invoke.return_value = {"StatusCode": 200}

    with patch("scripts.traffic_generator.time.sleep") as mock_sleep:
        run_loop(["fn-a"], interval_seconds=1.0, client=mock_client, iterations=1)

    mock_sleep.assert_not_called()


def test_run_loop_works_without_an_on_result_callback():
    mock_client = MagicMock()
    mock_client.invoke.return_value = {"StatusCode": 200}

    with patch("scripts.traffic_generator.time.sleep"):
        run_loop(["fn-a"], interval_seconds=0, client=mock_client, iterations=1)
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pytest tests/test_traffic_generator.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'scripts.traffic_generator'`

- [ ] **Step 4: Write minimal implementation** in `backend/scripts/traffic_generator.py`

```python
import argparse
import time

import boto3


def invoke_once(function_name: str, client=None) -> dict:
    client = client or boto3.client("lambda")
    response = client.invoke(
        FunctionName=function_name, InvocationType="RequestResponse", Payload=b"{}"
    )
    return {"function_name": function_name, "status_code": response["StatusCode"]}


def run_loop(
    function_names: list[str],
    interval_seconds: float,
    client=None,
    iterations: int | None = None,
    on_result=None,
) -> None:
    count = 0
    while iterations is None or count < iterations:
        for function_name in function_names:
            result = invoke_once(function_name, client=client)
            if on_result is not None:
                on_result(result)
        count += 1
        if iterations is None or count < iterations:
            time.sleep(interval_seconds)


def main() -> None:
    parser = argparse.ArgumentParser(description="Cloudsentry traffic generator")
    parser.add_argument("functions", nargs="+", help="Lambda function names to invoke on a loop")
    parser.add_argument("--interval", type=float, default=5.0, help="Seconds between invocation rounds")
    args = parser.parse_args()

    def log_result(result: dict) -> None:
        print(f"invoked {result['function_name']}: status {result['status_code']}")

    run_loop(args.functions, args.interval, on_result=log_result)


if __name__ == "__main__":
    main()
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pytest tests/test_traffic_generator.py -v`
Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
git add backend/scripts/__init__.py backend/scripts/traffic_generator.py backend/tests/test_traffic_generator.py
git commit -m "feat: add standalone traffic generator script"
```

---

## Task 7: Full-suite verification + manual live verification

**Files:** none created; this task verifies the assembled system.

- [ ] **Step 1: Run the full backend test suite**

Run (from `backend/`): `pytest -v`
Expected: All tests across every module in this plan (plus everything from Phase 1) PASS.

- [ ] **Step 2: Start the server locally**

Run: `uvicorn app.main:app --port 8000` (requires valid AWS credentials/region, e.g. `AWS_PROFILE=ops-agent AWS_DEFAULT_REGION=us-east-1`, since this is a real `uvicorn` run — lifespan fires for real here, so the background poller starts hitting live AWS on its normal interval).

- [ ] **Step 3: Confirm the initial graph snapshot**

Run: `curl -s http://localhost:8000/graph | python3 -m json.tool`
Expected: Empty (`{"nodes": {}, "edges": []}`) until the first poll cycle completes (up to ~30s after startup), then populated with real account data — matching Phase 1's `GET /graph` output.

- [ ] **Step 4: Connect a WebSocket client and watch for deltas**

This is a manual verification step — no new project dependency is added for it. Install a throwaway client library just for this check: `pip install websockets`, then run:

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

Expected: The script prints nothing until the next poll cycle finds a change; leave it running.

- [ ] **Step 5: Run the traffic generator against a real function in the account (your call — this invokes real AWS Lambda functions on a loop)**

In a separate terminal, using a function name confirmed to exist in the account (e.g. `ToolboxEchoFunction`, seen in the Phase 1 smoke test):

```bash
cd backend
AWS_PROFILE=ops-agent AWS_DEFAULT_REGION=us-east-1 .venv/bin/python3 scripts/traffic_generator.py ToolboxEchoFunction --interval 5
```

Expected: The generator prints `invoked ToolboxEchoFunction: status 200` every 5 seconds; within one or two poller cycles (~30-60s), the WebSocket client from Step 4 prints a `node_updated` event for `lambda:ToolboxEchoFunction` (its `last_metric_snapshot` changing as CloudWatch records the new invocations). Stop the generator with Ctrl+C once confirmed — it runs forever otherwise.

- [ ] **Step 6: Stop the server and clean up**

Stop the `uvicorn` process (Ctrl+C) and the WebSocket client script (Ctrl+C).

- [ ] **Step 7: Commit** (only if Steps 1–5 required any fixes)

```bash
git add -A
git commit -m "test: verify Phase 2 live graph end-to-end"
```

---

## Self-Review Notes

- **Spec coverage:** Graph diffing and the poller's fixed-interval rebuild-and-broadcast loop cover spec §4.2's "diffs the new snapshot against the last one and emits `graph_delta` events" (Tasks 1, 4). `WS /graph/stream` and the "clients never re-fetch the full graph except on first connect" rule from spec §4.2/§4.5 are covered by Task 5. The Traffic Generator's "genuine, real invocations, no fabricated data" requirement from spec §4.6 is covered by Task 6, using real `boto3` `lambda.invoke` calls only. The "graph visibly animates from genuinely self-generated activity" exit bar from spec §7 Phase 2 is covered by Task 7.
- **Out of scope confirmed absent:** no agent swarm, no action tools, no `PendingAction`/SQLite, no frontend — all correctly deferred to Phase 3+ per spec §7.
- **Type consistency:** `GraphPoller.poll_once()` (Task 4) calls `self.store.get()`/`self.store.set()` matching `GraphStore`'s exact signature (Task 2), `self.broadcaster.broadcast(event)` matching `ConnectionManager`'s exact signature (Task 3), and `diff_graphs(old_graph, new_graph)` matching Task 1's signature. `app.main`'s `graph_poller = GraphPoller(store=graph_store, broadcaster=connection_manager)` (Task 5) uses the exact constructor signature from Task 4, with `build_graph_fn` defaulting to the real `build_graph` from Phase 1 — never overridden in production code, only in tests via the `build_graph_fn` parameter.
</content>
