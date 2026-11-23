import json
import os
import shutil
import uuid
from pathlib import Path

from repositories.json_repository import JsonRepository

# This package now lives in api/scripts/repositories (used only by the Python
# scripts); the bundled seed data is still api/data.
BASE_DIR = Path(__file__).resolve().parent.parent.parent
BUNDLED_DATA_DIR = BASE_DIR / "data"
DATA_DIR = Path(os.getenv("DATA_DIR", str(BUNDLED_DATA_DIR))).resolve()

USE_MONGO = bool(os.getenv("MONGODB_URI"))

# Role granted to every allowed user that has no explicit roles yet. Keeps the
# app backwards-compatible with user documents created before roles existed.
DEFAULT_ROLE = "CEBOLLITAS"


def _seed_data_dir() -> None:
    """Copy bundled seed JSON files into DATA_DIR on first boot.

    When DATA_DIR points to a persistent volume (e.g. on Render), the volume
    starts empty. We copy the JSON files bundled with the repo so the app boots
    with the same baseline data as local dev. Existing files are never
    overwritten, so user-generated data on the volume is preserved across
    deploys.
    """
    if DATA_DIR == BUNDLED_DATA_DIR:
        return
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    for seed_file in BUNDLED_DATA_DIR.glob("*.json"):
        target = DATA_DIR / seed_file.name
        if not target.exists():
            shutil.copy2(seed_file, target)


def _make_repo(name: str):
    if USE_MONGO:
        from repositories.mongo_repository import COLLECTION_KINDS, MongoRepository

        return MongoRepository(name, COLLECTION_KINDS.get(name, "list"))
    return JsonRepository(DATA_DIR / f"{name}.json")


if not USE_MONGO:
    _seed_data_dir()

allowed_users_repo = _make_repo("allowed_users")
roles_repo = _make_repo("roles")
matches_repo = _make_repo("matches")
cebollitas_matches_repo = _make_repo("cebollitas_matches")
monthly_assignments_repo = _make_repo("monthly_assignments")
events_repo = _make_repo("events")
trips_repo = _make_repo("trips")
votes_repo = _make_repo("votes")

_REPOS_BY_NAME = {
    "allowed_users": allowed_users_repo,
    "roles": roles_repo,
    "matches": matches_repo,
    "cebollitas_matches": cebollitas_matches_repo,
    "monthly_assignments": monthly_assignments_repo,
    "events": events_repo,
    "trips": trips_repo,
    "votes": votes_repo,
}


def _seed_mongo() -> None:
    """Seed empty Mongo collections from bundled JSON on first boot.

    Mirrors _seed_data_dir for the Mongo backend: a fresh Atlas cluster starts
    empty, so we load the baseline data bundled with the repo. Only empty
    collections are seeded, so user-generated data survives redeploys.
    """
    for name, repo in _REPOS_BY_NAME.items():
        seed_file = BUNDLED_DATA_DIR / f"{name}.json"
        if not seed_file.exists() or repo.read():
            continue
        with seed_file.open("r", encoding="utf-8") as file:
            repo.write(json.load(file))


if USE_MONGO:
    _seed_mongo()


def get_allowed_users() -> list[dict]:
    users = allowed_users_repo.read()
    changed = False
    for user in users:
        if not user.get("id"):
            user["id"] = str(uuid.uuid4())
            changed = True
        if not user.get("roles"):
            user["roles"] = [DEFAULT_ROLE]
            changed = True
    if changed:
        allowed_users_repo.write(users)
    return users


def get_roles() -> list[dict]:
    return roles_repo.read()


def get_matches() -> list[dict]:
    return matches_repo.read()


def get_cebollitas_matches() -> list[dict]:
    return cebollitas_matches_repo.read()
