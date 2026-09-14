from unittest.mock import patch

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_returns_ok():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_get_graph_returns_builder_output():
    fake_graph = {
        "nodes": {"ec2:i-1": {"node_id": "ec2:i-1", "resource_type": "ec2"}},
        "edges": [],
    }

    with patch("app.main.build_graph", return_value=fake_graph):
        response = client.get("/graph")

    assert response.status_code == 200
    assert response.json() == fake_graph
