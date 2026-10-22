# Cloudsentry backend

FastAPI service that polls AWS into a graph, runs the three investigation agents, and gates every mutating action
behind explicit approval. Design: [`../docs/spec.md`](../docs/spec.md).

## Run

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -e '.[dev]'

# No credentials needed: fictional account + scripted agents
CLOUDSENTRY_DEMO=1 uvicorn app.main:app --port 8000

# Real AWS: copy .env.example to .env, fill it in, then
set -a && source .env && set +a && uvicorn app.main:app --port 8000
```

## API

| Endpoint | Purpose |
|---|---|
| `GET /health` | liveness |
| `GET /graph` | current graph snapshot (`nodes`, `edges`) |
| `WS /graph/stream` | `node_*` / `edge_*` deltas, `agent_move`, `finding`, `action_proposed`, `action_resolved` |
| `GET /actions` | every pending / approved / rejected action (the audit log) |
| `POST /actions/{id}/approve` | execute the proposed change; `409` if already resolved |
| `POST /actions/{id}/reject` | resolve without executing |

## Layout

- `app/graph/` — builder, poller, diffing, edge derivation, cost aggregation (Cost Explorer cached, see `CLOUDSENTRY_COST_TTL`)
- `app/agents/` — runner loop, node selection, scoped tool sets, Claude tool-use loop
- `app/actions/` — SQLite store, proposal tools (inert), executor (the only code that writes to AWS)
- `app/tools/` — thin boto3 wrappers
- `app/demo/` — fixture account, scripted investigator, simulated executor
- `scripts/traffic_generator.py` — standalone process that invokes Lambdas so the account has real activity

## Test

```bash
pytest -q        # 121 tests, no AWS or network access required
```

Configuration variables are listed in the root [README](../README.md#configuration).
