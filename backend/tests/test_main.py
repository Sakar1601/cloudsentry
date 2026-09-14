from fastapi.testclient import TestClient

from app.main import app, connection_manager, graph_store

client = TestClient(app)


def test_health_returns_ok():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_get_graph_returns_current_store_state():
    fake_graph = {
        "nodes": {"ec2:i-1": {"node_id": "ec2:i-1", "resource_type": "ec2"}},
        "edges": [],
    }
    graph_store.set(fake_graph)

    response = client.get("/graph")

    assert response.status_code == 200
    assert response.json() == fake_graph


def test_graph_stream_registers_and_unregisters_connection():
    with client.websocket_connect("/graph/stream") as websocket:
        assert len(connection_manager.connections) == 1

    assert len(connection_manager.connections) == 0


def test_agents_are_configured_with_correct_ids_and_tools():
    from app.main import cost_agent, performance_agent, security_agent

    assert cost_agent.agent_id == "cost"
    assert performance_agent.agent_id == "performance"
    assert security_agent.agent_id == "security"

    assert set(cost_agent.tool_dispatch.keys()) == {
        "get_cost_and_usage",
        "list_ec2_instances",
        "list_lambda_functions",
    }
    assert set(performance_agent.tool_dispatch.keys()) == {
        "get_cloudwatch_metric",
        "get_cloudwatch_logs",
        "list_lambda_functions",
        "list_ec2_instances",
    }
    assert set(security_agent.tool_dispatch.keys()) == {
        "get_iam_policy_for_role",
        "list_ec2_instances",
        "list_lambda_functions",
    }
