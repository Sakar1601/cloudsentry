from app.agents.selection import select_cost_node, select_performance_node, select_security_node


def test_select_cost_node_returns_none_on_first_observation():
    nodes = {"ec2:i-1": {"cost_7d": 10.0}}
    history = {}

    assert select_cost_node(nodes, history) is None
    assert history["ec2:i-1"] == [10.0]


def test_select_cost_node_returns_none_when_under_threshold():
    history = {"ec2:i-1": [10.0]}
    nodes = {"ec2:i-1": {"cost_7d": 12.0}}

    assert select_cost_node(nodes, history) is None


def test_select_cost_node_returns_node_when_over_threshold():
    history = {"ec2:i-1": [10.0]}
    nodes = {"ec2:i-1": {"cost_7d": 20.0}}

    assert select_cost_node(nodes, history) == "ec2:i-1"


def test_select_cost_node_ignores_nodes_with_no_cost_data():
    nodes = {"lambda:fn": {"cost_7d": None}}
    history = {}

    assert select_cost_node(nodes, history) is None
    assert "lambda:fn" not in history


def test_select_performance_node_uses_last_metric_snapshot_value():
    history = {"lambda:fn": [10.0]}
    nodes = {"lambda:fn": {"last_metric_snapshot": {"timestamp": "t", "value": 50.0}}}

    assert select_performance_node(nodes, history) == "lambda:fn"


def test_select_performance_node_ignores_nodes_without_metric_snapshot():
    nodes = {"lambda:fn": {"last_metric_snapshot": None}}
    history = {}

    assert select_performance_node(nodes, history) is None


def test_select_security_node_round_robins_through_lambda_nodes():
    nodes = {
        "lambda:a": {"resource_type": "lambda"},
        "lambda:b": {"resource_type": "lambda"},
        "ec2:i-1": {"resource_type": "ec2"},
    }
    history = {}

    first = select_security_node(nodes, history)
    second = select_security_node(nodes, history)
    third = select_security_node(nodes, history)

    assert [first, second, third] == ["lambda:a", "lambda:b", "lambda:a"]


def test_select_security_node_returns_none_when_no_lambda_nodes():
    nodes = {"ec2:i-1": {"resource_type": "ec2"}}
    history = {}

    assert select_security_node(nodes, history) is None
