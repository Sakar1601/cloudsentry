import asyncio
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
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
from app.graph.broadcast import ConnectionManager
from app.graph.poller import GraphPoller
from app.graph.store import GraphStore

graph_store = GraphStore()
connection_manager = ConnectionManager()
graph_poller = GraphPoller(store=graph_store, broadcaster=connection_manager)
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
FRONTEND_ORIGIN = os.environ.get("FRONTEND_ORIGIN", "http://localhost:3000")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_ORIGIN],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/graph")
def get_graph():
    return graph_store.get()


@app.websocket("/graph/stream")
async def graph_stream(websocket: WebSocket):
    await connection_manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        connection_manager.disconnect(websocket)


@app.get("/actions")
def list_actions():
    return action_store.list()


@app.post("/actions/{action_id}/approve")
async def approve_action(action_id: str):
    action = action_store.get(action_id)
    if action is None:
        raise HTTPException(status_code=404, detail="Action not found")
    if action["status"] != "pending":
        raise HTTPException(status_code=409, detail=f"Action already {action['status']}")

    outcome = execute_action(action)
    resolved = action_store.resolve(action_id, status="approved", result=outcome)

    await connection_manager.broadcast(
        {"type": "action_resolved", "action_id": action_id, "status": resolved["status"]}
    )
    return resolved


@app.post("/actions/{action_id}/reject")
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
