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
