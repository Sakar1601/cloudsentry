import asyncio
import os
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from app.actions.executor import execute_action
from app.actions.store import ActionStore
from app.agents.runner import AgentRunner
from app.agents.selection import select_cost_node, select_performance_node, select_security_node
from app.agents.tools import (
    COST_TOOL_NAMES,
    PERFORMANCE_TOOL_NAMES,
    SECURITY_TOOL_NAMES,
    tool_subset,
)
from app.agents.investigate import investigate_node
from app.graph.broadcast import ConnectionManager
from app.graph.builder import build_graph
from app.graph.poller import GraphPoller
from app.graph.store import GraphStore
from app.security import allowed_origin, require_request_allowed, websocket_allowed

# Demo mode runs the full backend against a fictional AWS account with scripted
# agents: no AWS credentials, no Anthropic key, no cost. See app/demo/.
DEMO_MODE = os.environ.get("CLOUDSENTRY_DEMO", "").lower() in ("1", "true", "yes")
POLL_INTERVAL = float(os.environ.get("CLOUDSENTRY_POLL_INTERVAL", "5" if DEMO_MODE else "30"))
AGENT_INTERVAL = float(os.environ.get("CLOUDSENTRY_AGENT_INTERVAL", "10" if DEMO_MODE else "60"))

if DEMO_MODE:
    from app.demo.executor import simulate_action
    from app.demo.fixtures import DemoGraphBuilder
    from app.demo.investigate import make_demo_investigator

    _build_graph_fn = DemoGraphBuilder()
    _investigate_fn = make_demo_investigator()
else:
    _build_graph_fn = build_graph
    _investigate_fn = investigate_node

graph_store = GraphStore()
connection_manager = ConnectionManager()
graph_poller = GraphPoller(
    store=graph_store,
    broadcaster=connection_manager,
    interval_seconds=POLL_INTERVAL,
    build_graph_fn=_build_graph_fn,
)
# Overridable so the test suite never writes into the same file a real
# running server reads from (see backend/tests/conftest.py, which points
# this at ":memory:" for every pytest run) — without this, `pytest` and
# `uvicorn` sharing a cwd meant test fixture rows (node ids like "ec2:i-1")
# showed up in a real, running server's actual audit log.
action_store = ActionStore(db_path=os.environ.get("CLOUDSENTRY_ACTIONS_DB", "cloudsentry_actions.db"))

cost_tool_definitions, cost_tool_dispatch = tool_subset(COST_TOOL_NAMES + ["stop_ec2_instance"])
performance_tool_definitions, performance_tool_dispatch = tool_subset(
    PERFORMANCE_TOOL_NAMES + ["resize_ec2_instance"]
)
security_tool_definitions, security_tool_dispatch = tool_subset(
    SECURITY_TOOL_NAMES + ["tighten_iam_policy"]
)

cost_agent = AgentRunner(
    agent_id="cost",
    store=graph_store,
    broadcaster=connection_manager,
    select_node_fn=select_cost_node,
    tool_definitions=cost_tool_definitions,
    tool_dispatch=cost_tool_dispatch,
    investigation_focus="cost trends",
    action_tool_name="stop_ec2_instance",
    action_store=action_store,
    interval_seconds=AGENT_INTERVAL,
    investigate_fn=_investigate_fn,
)
performance_agent = AgentRunner(
    agent_id="performance",
    store=graph_store,
    broadcaster=connection_manager,
    select_node_fn=select_performance_node,
    tool_definitions=performance_tool_definitions,
    tool_dispatch=performance_tool_dispatch,
    investigation_focus="performance and latency issues",
    action_tool_name="resize_ec2_instance",
    action_store=action_store,
    interval_seconds=AGENT_INTERVAL,
    investigate_fn=_investigate_fn,
)
security_agent = AgentRunner(
    agent_id="security",
    store=graph_store,
    broadcaster=connection_manager,
    select_node_fn=select_security_node,
    tool_definitions=security_tool_definitions,
    tool_dispatch=security_tool_dispatch,
    investigation_focus="IAM security risks such as overly broad permissions",
    action_tool_name="tighten_iam_policy",
    action_store=action_store,
    interval_seconds=AGENT_INTERVAL,
    investigate_fn=_investigate_fn,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    tasks = [
        asyncio.create_task(graph_poller.run_forever()),
        asyncio.create_task(cost_agent.run_forever()),
        asyncio.create_task(performance_agent.run_forever()),
        asyncio.create_task(security_agent.run_forever()),
    ]
    yield
    for task in tasks:
        task.cancel()


app = FastAPI(title="Cloudsentry Graph API", lifespan=lifespan)

# The frontend (Next.js) runs on a different origin/port than this API in
# every environment — local dev (localhost:3000 -> localhost:8000) and any
# real deployment (Vercel -> the backend's own host) alike — so the browser
# needs explicit CORS headers or every fetch/WebSocket call from the UI is
# blocked. FRONTEND_ORIGIN lets a real deployment point this at its actual
# frontend URL; local dev works out of the box against the default.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[allowed_origin()],
    allow_methods=["GET", "POST"],
    allow_headers=["Authorization", "Content-Type"],
)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/graph", dependencies=[Depends(require_request_allowed)])
def get_graph():
    return graph_store.get()


@app.websocket("/graph/stream")
async def graph_stream(websocket: WebSocket):
    if not websocket_allowed(websocket):
        await websocket.close(code=1008)
        return
    if not await connection_manager.connect(websocket):
        return
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        connection_manager.disconnect(websocket)


@app.get("/actions", dependencies=[Depends(require_request_allowed)])
def list_actions():
    return action_store.list()


@app.post("/actions/{action_id}/approve", dependencies=[Depends(require_request_allowed)])
async def approve_action(action_id: str):
    action = action_store.get(action_id)
    if action is None:
        raise HTTPException(status_code=404, detail="Action not found")
    if action["status"] != "pending":
        raise HTTPException(status_code=409, detail=f"Action already {action['status']}")

    outcome = simulate_action(action) if DEMO_MODE else execute_action(action)
    resolved = action_store.resolve(action_id, status="approved", result=outcome)

    await connection_manager.broadcast(
        {"type": "action_resolved", "action_id": action_id, "status": resolved["status"]}
    )
    return resolved


@app.post("/actions/{action_id}/reject", dependencies=[Depends(require_request_allowed)])
async def reject_action(action_id: str):
    action = action_store.get(action_id)
    if action is None:
        raise HTTPException(status_code=404, detail="Action not found")
    if action["status"] != "pending":
        raise HTTPException(status_code=409, detail=f"Action already {action['status']}")

    resolved = action_store.resolve(action_id, status="rejected", result=None)

    await connection_manager.broadcast(
        {"type": "action_resolved", "action_id": action_id, "status": resolved["status"]}
    )
    return resolved
