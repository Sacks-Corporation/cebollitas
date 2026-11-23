# Cebollitas Oficial API (NestJS)

NestJS port of the former FastAPI backend. It keeps the same routes, status
codes, `{"detail": ...}` error bodies and response shapes, and reads and writes
the same data (MongoDB, or JSON files when `MONGODB_URI` is unset), so the
frontend did not need any change.

## Commands

```bash
npm install
cp .env.example .env
npm run start:dev      # watch mode on http://localhost:8000 (PORT)
npm run build          # compile to dist/
npm start              # node dist/main (production)
npm test               # Jest unit tests
npm run lint
npm run typecheck
```

## Layout

```
src/
  main.ts, app.module.ts      bootstrap: CORS, JSON body parser, FastAPI-style errors
  config/env.ts               env access + bundled seed data dir
  common/
    auth/                     JWT (HS256, 7 days), guards, @CurrentUser
    crypto/fernet.ts          Fernet, wire compatible with Python's cryptography
    validation/               Pydantic-like zod builders + FastAPI-style 422s
    py-compat.ts              Python round(), isoformat(), Pydantic date/datetime output, sorting
    http-exception.filter.ts  {"detail": ...} for every error
  persistence/                read-all/write-all repositories (JSON / Mongo) + seeding
  core/                       roles, votes, images (Cloudinary), scoring
  modules/<feature>/          controller + service + schemas per feature
data/                         seed JSON (seeds empty Mongo collections; zipped by /api/admin/backup)
scripts/                      offline Python scripts (see below)
```

## Behaviors kept from the FastAPI version

- Validation mirrors Pydantic lax mode (numeric strings → int/float, `5.0` → int,
  no int → str coercion, extra keys ignored) and returns FastAPI's 422 body
  (`type`/`loc`/`msg`/`input`/`ctx`), with path, query and body errors together.
- Auth: missing/non-Bearer header → 403, bad token → 401 "Token inválido.".
  Tokens issued by the old backend stay valid (same secret and format).
- Rounding uses Python's banker's `round()`, and averages use Python 3.12's
  compensated `sum()`.
- Stored timestamps use Python's `isoformat()` (`...+00:00`); responses use
  Pydantic's format (`...Z`).
- Votes use Fernet, so votes encrypted by the old backend still decrypt.

## Python scripts (`scripts/`)

Excel loaders, the weekly Google Sheet ↔ Mongo sync (GitHub Actions), and the
Mongo migration/sync helpers. They read `api/data` and `api/.env`, and keep
their own copy of the old repository layer in `scripts/repositories`.

```bash
cd api
pip install -r scripts/requirements.txt
python scripts/sync_allowed_users.py
```

See `scripts/SHEET_SYNC_SETUP.md` for the Sheet sync.

## Deploying on Render

- Root directory: `api`
- Runtime: Node (22+)
- Build command: `npm ci && npm run build`
- Start command: `npm start`
- Health check path: `/health`
- Env vars: same as `.env.example` (Render provides `PORT`).
