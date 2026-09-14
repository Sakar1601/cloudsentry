import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect

from app.graph.broadcast import ConnectionManager
from app.graph.poller import GraphPoller
from app.graph.store import GraphStore

graph_store = GraphStore()
connection_manager = ConnectionManager()
graph_poller = GraphPoller(store=graph_store, broadcaster=connection_manager)


@asynccontextmanager
async def lifespan(app: FastAPI):
    poller_task = asyncio.create_task(graph_poller.run_forever())
    yield
    poller_task.cancel()


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
