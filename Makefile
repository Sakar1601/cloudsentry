.PHONY: help demo up install test lint backend frontend

help:  ## list targets
	@grep -E '^[a-z-]+:.*##' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  %-10s %s\n", $$1, $$2}'

demo:  ## run the whole app in demo mode via Docker (no credentials) -> :3000
	docker compose up --build

install:  ## install backend + frontend deps locally
	cd backend && python3 -m venv .venv && .venv/bin/pip install -e '.[dev]'
	cd frontend && npm ci

backend:  ## run API in demo mode on :8000
	cd backend && CLOUDSENTRY_DEMO=1 CLOUDSENTRY_ACTIONS_DB=:memory: .venv/bin/uvicorn app.main:app --port 8000

frontend:  ## run UI on :3000
	cd frontend && npm run dev

test:  ## run backend + frontend tests
	cd backend && .venv/bin/pytest -q
	cd frontend && npm test
