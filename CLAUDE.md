# Cebollitas Oficial

## Project summary
Cebollitas Oficial is a private group scoring app that tracks attendance and organizer points for yearly events. It is a monorepo with a NestJS (TypeScript) backend and a React frontend. Persistence is pluggable: local JSON files by default, MongoDB when `MONGODB_URI` is set.

## Language convention
All code, comments, docs, and commits are in English. All user-facing UI copy is in rioplatense Spanish.

## Architecture map
- Frontend pages: `/web/src/pages`
- Frontend reusable components: `/web/src/components`
- Backend feature modules (controller + service + schemas): `/api/src/modules`
- Backend shared services (roles, votes, images, scoring): `/api/src/core`
- Backend cross-cutting code (auth guards, validation, Python-compat helpers): `/api/src/common`
- Persistence (JSON/Mongo repositories): `/api/src/persistence`
- Seed JSON files: `/api/data`
- Offline Python scripts (Excel loaders, Sheet sync, migrations): `/api/scripts`

## Key business rules
- At least 4 attendees are required per event.
- Only `creatorId` can edit/delete their own event.
- Votes must be encrypted and individual votes must never be exposed.
- Only attendees can vote an event.
- Only one vote per user per event (`voterIdHash`).
- Scoring is automatic by `eventType` in `api/src/core/scoring.ts`.

## Commands
- Frontend: `cd web && npm run dev`, `npm run build`, `npm run typecheck`, `npm run lint`
- Backend: `cd api && npm run start:dev`, `npm run build`, `npm test`, `npm run lint`, `npm run typecheck`
- Python scripts: `cd api && pip install -r scripts/requirements.txt && python scripts/<script>.py`

## Common pitfalls
- Persistence is abstracted behind `DataStoreService` in `api/src/persistence` (read-all/write-all interface). Controller/service code must use it, never touch JSON files or Mongo directly. (The Python scripts keep their own copy in `api/scripts/repositories`.)
- The API was ported from FastAPI and keeps its wire behavior: `{"detail": ...}` errors, FastAPI-style 422s (use the `py-schema` builders + `@ValidateRequest`), Python `round()` via `pyRound`, Python-style stored timestamps via `pyUtcNowIso`.
- Do not break vote anonymity.
- Do not hardcode UI strings in components; use `/web/src/i18n/es.ts`.
- Do not trust `creatorId` from request payloads; derive it from JWT.
