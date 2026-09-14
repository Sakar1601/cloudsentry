from fastapi import FastAPI

from app.graph.builder import build_graph

app = FastAPI(title="Cloudsentry Graph API")


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/graph")
def get_graph():
    return build_graph()
