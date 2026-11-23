# Cebollitas Oficial

Private monorepo for a yearly friend-group scoring app. The frontend lives in `web` (React + TypeScript + Tailwind) and the backend lives in `api` (NestJS + MongoDB or JSON persistence).

## Repository structure

- `web/`: React app
- `api/`: NestJS app (`src/`), seed data (`data/`) and offline Python scripts (`scripts/`)

## Frontend setup

```bash
cd web
npm install
npm run dev
```

The app runs on `http://localhost:5173`.

## Backend setup

```bash
cd api
npm install
cp .env.example .env
npm run start:dev
```

The Python scripts in `api/scripts` (Excel loaders, Google Sheet sync,
migrations) have their own dependencies: `pip install -r scripts/requirements.txt`
and run them from `api/` (e.g. `python scripts/sync_allowed_users.py`).

The API runs on `http://localhost:8000`.

## Generate vote encryption key

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url') + '=')"
```

Set the value in `VOTE_ENCRYPTION_KEY`.

## Add a new allowed user

Edit `api/data/allowed_users.json` and append:

```json
{ "name": "Full Name", "email": "user@example.com" }
```

`id` is auto-generated and persisted on first load if omitted.

When running on MongoDB, `allowed_users.json` stays the source of truth. After
editing it (adding users or fixing emails), push the changes to Mongo:

```bash
cd api
python scripts/sync_allowed_users.py
```

The script matches users by `id`: it updates name/email when they differ and
adds new users. It never deletes users that only exist in Mongo, and it is
idempotent (re-running with no changes reports nothing to do). Requires
`MONGODB_URI` to be set.

## Deployment notes

- Deploy `web/` to Netlify.
- Deploy `api/` to Render.
- Deploy `images` to Cloudinary.

### Persistence

The API backend is pluggable. It uses MongoDB when `MONGODB_URI` is set, and
falls back to local JSON files otherwise.

**MongoDB (recommended for Render):**

1. Create a MongoDB Atlas cluster, a database user, and allow network access
   from `0.0.0.0/0` (Render uses dynamic outbound IPs).
2. In the Render service, set the environment variables:
   - `MONGODB_URI` — the Atlas connection string (with the real password).
   - `MONGODB_DB` — database name (defaults to `cebollitas`).
3. On first boot, empty collections are auto-seeded from the JSON files bundled
   in `api/data/`. Existing data is never overwritten, so redeploys are safe.
   No Persistent Disk is required.

To migrate an existing local dataset manually instead of relying on auto-seed:

```bash
cd api
python scripts/migrate_json_to_mongo.py
```

**JSON files (local dev / fallback):** leave `MONGODB_URI` unset. On Render,
mount a Persistent Disk at `/api/data` so the JSON files survive redeploys.
