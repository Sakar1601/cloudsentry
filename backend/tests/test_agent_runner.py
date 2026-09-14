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
