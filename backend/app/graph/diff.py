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
