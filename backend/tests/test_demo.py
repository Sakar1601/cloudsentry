import asyncio

from app.actions.store import ActionStore
from app.agents.tools import PERFORMANCE_TOOL_NAMES, tool_subset
from app.demo.executor import simulate_action
from app.demo.fixtures import SPIKE_EVERY, DemoGraphBuilder
from app.demo.investigate import make_demo_investigator


def test_demo_graph_matches_real_graph_shape():
    graph = DemoGraphBuilder(seed=1)()
    assert graph["nodes"] and graph["edges"]
    for node in graph["nodes"].values():
        assert set(node) == {
            "node_id", "resource_type", "name", "state", "tags", "cost_7d", "last_metric_snapshot",
        }
    for edge in graph["edges"]:
        assert edge["source"] in graph["nodes"] and edge["target"] in graph["nodes"]


def test_demo_graph_spikes_periodically():
    builder = DemoGraphBuilder(seed=1)
    cost = [builder()["nodes"]["ec2:i-0a1b2c3d4e5f60003"]["cost_7d"] for _ in range(SPIKE_EVERY)]
    assert cost[-1] > 1.5 * max(cost[:-1])


def test_demo_investigator_proposes_each_action_once(monkeypatch):
    monkeypatch.setattr("app.demo.investigate.THINK_SECONDS", (0, 0))
    store = ActionStore(db_path=":memory:")
    _, dispatch = tool_subset(PERFORMANCE_TOOL_NAMES + ["resize_ec2_instance"])
    from app.actions.proposals import build_action_tool

    node = DemoGraphBuilder(seed=1)()["nodes"]["ec2:i-0a1b2c3d4e5f60001"]
    dispatch["resize_ec2_instance"] = build_action_tool(store, "performance", node["node_id"], "resize_ec2_instance")
    investigate = make_demo_investigator()

    text, first = asyncio.run(investigate(node, "performance and latency issues", [], dispatch))
    _, second = asyncio.run(investigate(node, "performance and latency issues", [], dispatch))

    assert node["name"] in text
    assert len(first) == 1 and second == []
    assert store.list()[0]["tool_name"] == "resize_ec2_instance"


def test_simulated_action_never_touches_aws():
    outcome = simulate_action({"tool_name": "stop_ec2_instance", "params": {"instance_id": "i-1"}})
    assert outcome["success"] and outcome["result"]["simulated"]
