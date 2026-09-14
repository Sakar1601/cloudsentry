import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect

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

cost_tool_definitions, cost_tool_dispatch = tool_subset(COST_TOOL_NAMES)
performance_tool_definitions, performance_tool_dispatch = tool_subset(PERFORMANCE_TOOL_NAMES)
security_tool_definitions, security_tool_dispatch = tool_subset(SECURITY_TOOL_NAMES)

cost_agent = AgentRunner(
    agent_id="cost",
    store=graph_store,
    broadcaster=connection_manager,
    select_node_fn=select_cost_node,
    tool_definitions=cost_tool_definitions,
    tool_dispatch=cost_tool_dispatch,
    investigation_focus="cost trends",
)
performance_agent = AgentRunner(
    agent_id="performance",
    store=graph_store,
    broadcaster=connection_manager,
    select_node_fn=select_performance_node,
    tool_definitions=performance_tool_definitions,
    tool_dispatch=performance_tool_dispatch,
    investigation_focus="performance and latency issues",
)
security_agent = AgentRunner(
    agent_id="security",
    store=graph_store,
    broadcaster=connection_manager,
    select_node_fn=select_security_node,
    tool_definitions=security_tool_definitions,
    tool_dispatch=security_tool_dispatch,
    investigation_focus="IAM security risks such as overly broad permissions",
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
