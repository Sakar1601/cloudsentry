# Cloudsentry frontend

Next.js (App Router) + TypeScript UI for Cloudsentry's live infrastructure graph. Design: [`../docs/spec.md`](../docs/spec.md).

## Modes

| Mode | How | What `/` shows |
|---|---|---|
| Real backend | `npm run dev` with the FastAPI service running | the working app (graph, approvals, activity) |
| Static demo | `NEXT_PUBLIC_STATIC_DEMO=1` (`npm run build:demo`) | an explainer page with the live product embedded; the app is at `/demo` |

All backend access goes through [`lib/api.ts`](lib/api.ts). In static-demo mode it talks to the in-browser simulator
([`lib/demo/engine.ts`](lib/demo/engine.ts)) instead of the API, which lets the whole UI export as plain static files.

## Local development

```bash
cp .env.local.example .env.local      # NEXT_PUBLIC_API_BASE_URL, default http://localhost:8000
npm ci
npm run dev
```

Requires the backend (`../backend`) to be reachable at `NEXT_PUBLIC_API_BASE_URL`. For no-credentials development run it
with `CLOUDSENTRY_DEMO=1`.

## Structure

- `app/` — `/` (landing in static demo, app otherwise), `/demo`, `/audit`
- `components/` — `DemoStage` (graph + overlays), `AppSidebar` / `ActivityFeed` (approvals and agent activity),
  `GraphCanvas`, `ActionCard`, `AuditTable`, and `landing/` (the explainer sections)
- `lib/` — `api.ts` (backend seam), `useGraphSocket.ts` (state from REST + WebSocket), `demo/engine.ts` (simulator),
  `walkthrough.ts` (the five-step cycle copy shared by the stepper and the written flow)

If the backend sets `CLOUDSENTRY_API_TOKEN`, the UI shows a token prompt on first load. The token is kept in
`sessionStorage` for that browser session only and is never part of the build.

## Test and build

```bash
npm test                 # vitest (44 tests)
npx tsc --noEmit
npm run build            # production build for the real backend
npm run build:demo       # static export to out/
```

## Deployment

- **Static demo:** GitHub Pages via `.github/workflows/pages.yml` (sets `NEXT_PUBLIC_BASE_PATH=/<repo>`).
- **Real app:** Vercel (zero config). Set `NEXT_PUBLIC_API_BASE_URL` to the deployed backend. The
  backend's ECS service has no public endpoint yet; see `../infra/README.md`.
