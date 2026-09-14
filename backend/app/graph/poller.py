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
