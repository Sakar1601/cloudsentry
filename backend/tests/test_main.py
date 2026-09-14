from unittest.mock import patch

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


def test_agents_have_correct_action_tool_wired_in():
    from app.main import cost_agent, performance_agent, security_agent

    assert cost_agent.action_tool_name == "stop_ec2_instance"
    assert "stop_ec2_instance" in {d["name"] for d in cost_agent.tool_definitions}

    assert performance_agent.action_tool_name == "resize_ec2_instance"
    assert "resize_ec2_instance" in {d["name"] for d in performance_agent.tool_definitions}

    assert security_agent.action_tool_name == "tighten_iam_policy"
    assert "tighten_iam_policy" in {d["name"] for d in security_agent.tool_definitions}


def test_list_actions_includes_seeded_record():
    from app.main import action_store

    seeded = action_store.create(
        agent_id="cost", node_id="ec2:i-1", tool_name="stop_ec2_instance", params={"instance_id": "i-1"}
    )

    response = client.get("/actions")

    assert response.status_code == 200
    ids_in_response = {a["id"] for a in response.json()}
    assert seeded["id"] in ids_in_response


def test_approve_action_executes_and_resolves():
    from app.main import action_store

    seeded = action_store.create(
        agent_id="cost", node_id="ec2:i-1", tool_name="stop_ec2_instance", params={"instance_id": "i-1"}
    )
    fake_outcome = {"success": True, "result": {"instance_id": "i-1", "action": "stop"}}

    with patch("app.main.execute_action", return_value=fake_outcome) as mock_execute:
        response = client.post(f"/actions/{seeded['id']}/approve")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "approved"
    assert body["result"] == fake_outcome
    mock_execute.assert_called_once()
    assert action_store.get(seeded["id"])["status"] == "approved"


def test_approve_action_returns_404_for_unknown_id():
    response = client.post("/actions/does-not-exist/approve")

    assert response.status_code == 404


def test_approve_action_returns_409_when_already_resolved():
    from app.main import action_store

    seeded = action_store.create(
        agent_id="cost", node_id="ec2:i-1", tool_name="stop_ec2_instance", params={"instance_id": "i-1"}
    )
    action_store.resolve(seeded["id"], status="rejected", result=None)

    response = client.post(f"/actions/{seeded['id']}/approve")

    assert response.status_code == 409


def test_reject_action_resolves_without_executing():
    from app.main import action_store

    seeded = action_store.create(
        agent_id="security", node_id="lambda:fn", tool_name="tighten_iam_policy", params={"role_name": "r"}
    )

    with patch("app.main.execute_action") as mock_execute:
        response = client.post(f"/actions/{seeded['id']}/reject")

    assert response.status_code == 200
    assert response.json()["status"] == "rejected"
    mock_execute.assert_not_called()
    assert action_store.get(seeded["id"])["status"] == "rejected"
