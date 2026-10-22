"""Request-level protections for the API.

Two independent layers, because the API can mutate an AWS account:

1. Origin checks. A page on any website can make your browser send a POST to
   http://localhost:8000 (CORS only stops it *reading* the reply), and can open a
   WebSocket to it. Browsers always attach an Origin header to such requests, so
   any state-changing request or WebSocket whose Origin is not the configured
   frontend is refused. This closes cross-site request forgery.
2. An optional bearer token (CLOUDSENTRY_API_TOKEN). When it is set, every
   endpoint except /health requires it. Always set it for anything reachable
   beyond your own machine.
"""

import os
import secrets

from fastapi import HTTPException, Request, WebSocket

SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}


def allowed_origin() -> str:
    return os.environ.get("FRONTEND_ORIGIN", "http://localhost:3000")


def _configured_token() -> str | None:
    return os.environ.get("CLOUDSENTRY_API_TOKEN") or None


def token_is_valid(provided: str | None) -> bool:
    expected = _configured_token()
    if expected is None:
        return True
    return provided is not None and secrets.compare_digest(provided.encode(), expected.encode())


def require_request_allowed(request: Request) -> None:
    """FastAPI dependency for HTTP endpoints."""
    origin = request.headers.get("origin")
    if request.method not in SAFE_METHODS and origin is not None and origin != allowed_origin():
        raise HTTPException(status_code=403, detail="Cross-origin request refused")

    header = request.headers.get("authorization", "")
    provided = header[7:].strip() if header.lower().startswith("bearer ") else None
    if not token_is_valid(provided):
        raise HTTPException(
            status_code=401, detail="Missing or invalid API token", headers={"WWW-Authenticate": "Bearer"}
        )


def websocket_allowed(websocket: WebSocket) -> bool:
    """Origin and token check for the WebSocket handshake (token via ?token=)."""
    origin = websocket.headers.get("origin")
    if origin is not None and origin != allowed_origin():
        return False
    return token_is_valid(websocket.query_params.get("token"))
