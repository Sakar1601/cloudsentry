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
