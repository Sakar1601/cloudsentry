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
