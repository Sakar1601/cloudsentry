from fastapi import FastAPI

app = FastAPI(title="Cloudsentry Graph API")


@app.get("/health")
def health():
    return {"status": "ok"}
