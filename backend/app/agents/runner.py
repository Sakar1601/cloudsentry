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
