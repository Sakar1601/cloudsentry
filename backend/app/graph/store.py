class GraphStore:
    def __init__(self) -> None:
        self._graph: dict = {"nodes": {}, "edges": []}

    def get(self) -> dict:
        return self._graph

    def set(self, graph: dict) -> None:
        self._graph = graph
