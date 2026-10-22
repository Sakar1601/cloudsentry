import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from app.graph.broadcast import MAX_CONNECTIONS, ConnectionManager
from app.main import action_store, app, connection_manager

ORIGIN = "http://localhost:3000"
client = TestClient(app)


@pytest.fixture(autouse=True)
def clean_env(monkeypatch):
    monkeypatch.delenv("CLOUDSENTRY_API_TOKEN", raising=False)
    monkeypatch.setenv("FRONTEND_ORIGIN", ORIGIN)


def pending_id() -> str:
    return action_store.create("cost", "ec2:i-0123456789abcdef0", "stop_ec2_instance", {"instance_id": "i-0123456789abcdef0"})["id"]


class TestCrossSiteRequestForgery:
    def test_post_from_a_foreign_origin_is_refused_and_nothing_executes(self):
        action_id = pending_id()

        response = client.post(f"/actions/{action_id}/approve", headers={"Origin": "https://evil.example"})

        assert response.status_code == 403
        assert action_store.get(action_id)["status"] == "pending"

    def test_reject_from_a_foreign_origin_is_refused_too(self):
        action_id = pending_id()

        assert client.post(f"/actions/{action_id}/reject", headers={"Origin": "https://evil.example"}).status_code == 403
        assert action_store.get(action_id)["status"] == "pending"

    def test_post_from_the_real_frontend_origin_works(self):
        action_id = pending_id()

        response = client.post(f"/actions/{action_id}/reject", headers={"Origin": ORIGIN})

        assert response.status_code == 200

    def test_requests_with_no_origin_header_still_work(self):
        # curl, scripts and server-to-server calls send no Origin; browsers always do.
        assert client.get("/graph").status_code == 200

    def test_websocket_from_a_foreign_origin_is_refused(self):
        with pytest.raises(WebSocketDisconnect):
            with client.websocket_connect("/graph/stream", headers={"Origin": "https://evil.example"}):
                pass
        assert len(connection_manager.connections) == 0

    def test_websocket_from_the_frontend_origin_is_accepted(self):
        with client.websocket_connect("/graph/stream", headers={"Origin": ORIGIN}):
            assert len(connection_manager.connections) == 1


class TestApiToken:
    def test_endpoints_are_open_when_no_token_is_configured(self):
        assert client.get("/actions").status_code == 200

    def test_requests_without_the_token_are_rejected_when_configured(self, monkeypatch):
        monkeypatch.setenv("CLOUDSENTRY_API_TOKEN", "s3cret-token")

        for path in ("/graph", "/actions"):
            response = client.get(path)
            assert response.status_code == 401
            assert response.headers["www-authenticate"] == "Bearer"

    def test_wrong_token_is_rejected_and_correct_token_is_accepted(self, monkeypatch):
        monkeypatch.setenv("CLOUDSENTRY_API_TOKEN", "s3cret-token")

        assert client.get("/actions", headers={"Authorization": "Bearer nope"}).status_code == 401
        assert client.get("/actions", headers={"Authorization": "Bearer s3cret-token"}).status_code == 200
        assert client.get("/actions", headers={"Authorization": "Basic s3cret-token"}).status_code == 401

    def test_health_stays_open_for_load_balancer_checks(self, monkeypatch):
        monkeypatch.setenv("CLOUDSENTRY_API_TOKEN", "s3cret-token")
        assert client.get("/health").status_code == 200

    def test_approve_requires_the_token(self, monkeypatch):
        monkeypatch.setenv("CLOUDSENTRY_API_TOKEN", "s3cret-token")
        action_id = pending_id()

        assert client.post(f"/actions/{action_id}/approve").status_code == 401
        assert action_store.get(action_id)["status"] == "pending"

    def test_websocket_needs_the_token_in_the_query(self, monkeypatch):
        monkeypatch.setenv("CLOUDSENTRY_API_TOKEN", "s3cret-token")

        with pytest.raises(WebSocketDisconnect):
            with client.websocket_connect("/graph/stream"):
                pass
        with client.websocket_connect("/graph/stream?token=s3cret-token"):
            assert len(connection_manager.connections) == 1


class TestConnectionCap:
    @pytest.mark.anyio
    async def test_connections_beyond_the_cap_are_refused(self):
        class FakeSocket:
            def __init__(self):
                self.accepted = False
                self.closed_with = None

            async def accept(self):
                self.accepted = True

            async def close(self, code):
                self.closed_with = code

        manager = ConnectionManager()
        sockets = [FakeSocket() for _ in range(MAX_CONNECTIONS)]
        for socket in sockets:
            assert await manager.connect(socket) is True

        extra = FakeSocket()
        assert await manager.connect(extra) is False
        assert extra.closed_with == 1013 and extra.accepted is False
