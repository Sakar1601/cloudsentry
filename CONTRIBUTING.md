# Contributing to Cloudsentry

Contributions are welcome.

## Getting set up

```sh
git clone https://github.com/Sakar1601/cloudsentry.git
cd cloudsentry
make install
```

See the [README](README.md) for prerequisites and configuration.

## Workflow

1. Create a branch from `main`: `feat/<short-name>`, `fix/<short-name>`, `docs/<short-name>` or `chore/<short-name>`.
2. Make focused changes. Keep unrelated changes in separate pull requests.
3. Run the checks locally before pushing:
   ```sh
   make test                       # backend + frontend tests
   (cd backend && ruff check app scripts tests)
   (cd frontend && npx tsc --noEmit && npm run lint:unused && npm run build)
   ```
4. Commit with [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`).
5. Open a pull request and fill in the template. CI must pass and conversations must be resolved before merging.
6. PRs are **squash-merged** into `main`, which is protected: no direct pushes, no force pushes, linear history.

## Reporting bugs and requesting features

Use the issue templates. For security problems, follow [SECURITY.md](SECURITY.md) instead of opening a public issue.

## Code style

Follow the existing conventions; formatting is governed by [`.editorconfig`](.editorconfig) and the project's linters.
Never commit secrets or `.env` files.
