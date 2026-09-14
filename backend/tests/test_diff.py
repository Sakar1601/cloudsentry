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
