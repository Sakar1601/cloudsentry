# Cloudsentry Frontend

Next.js (App Router) + TypeScript UI for Cloudsentry's live infrastructure graph. See `docs/spec.md` and `docs/superpowers/plans/phase-5-web-ui.md` for design details.

## Local development

```bash
cp .env.local.example .env.local
npm install
npm run dev
```

Requires the backend (`backend/`) running locally and reachable at the URL in `NEXT_PUBLIC_API_BASE_URL` (defaults to `http://localhost:8000`).

## Testing

```bash
npm test
```

## Deployment

This app deploys to [Vercel](https://vercel.com) (per `docs/spec.md` §4.8's "S3 + CloudFront or Vercel" choice — Vercel is the zero-config option for a Next.js app and needs no additional Terraform).

1. Connect this repository to a Vercel project (via the Vercel dashboard, or the `vercel` CLI — requires a Vercel account this project cannot create or authenticate for you).
2. Set `NEXT_PUBLIC_API_BASE_URL` as a Vercel project environment variable, pointing at the deployed backend's URL.
3. **Dependency note:** the backend's ECS service (`infra/terraform/ecs/`) currently has no public endpoint — see that module's "no ALB" deferred item in `infra/README.md`. Add a load balancer and public routing to the backend before this frontend deployment can actually reach a live backend from outside AWS's network.
4. Deploy: push to the connected branch, or run `vercel deploy` locally.

`vercel.json` in this directory just pins the build/dev/install commands Vercel would otherwise infer.
