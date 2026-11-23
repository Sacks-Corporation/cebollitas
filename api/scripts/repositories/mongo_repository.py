import os
from typing import Any

from pymongo import MongoClient
from pymongo.collection import Collection
from pymongo.database import Database

_client: MongoClient | None = None

# Files whose JSON root is a single object (dict) rather than a list of
# documents. These are stored as one wrapper document per collection.
COLLECTION_KINDS = {
    "monthly_assignments": "document",
}

_SINGLETON_KEY = "_singleton"


def get_client() -> MongoClient:
    global _client
    if _client is None:
        uri = os.environ["MONGODB_URI"]
        _client = MongoClient(uri)
    return _client


def get_db() -> Database:
    db_name = os.getenv("MONGODB_DB", "cebollitas")
    return get_client()[db_name]


class MongoRepository:
    """Drop-in replacement for JsonRepository backed by a MongoDB collection.

    Mirrors the read-all / write-all interface so routes and services stay
    unchanged. `write` replaces the whole collection; this matches the JSON
    file semantics but is not atomic, which is acceptable for this app's scale.

    Two shapes are supported:
    - kind="list" (default): the JSON root is a list; each element is stored as
      its own document and `read` returns the list. The document's `id` field
      is used as Mongo's `_id`, so there is a single identifier; `read` maps it
      back to `id` so callers keep seeing the original shape.
    - kind="document": the JSON root is a dict; it is stored inside one wrapper
      document and `read` returns the dict.
    """

    def __init__(self, collection_name: str, kind: str = "list") -> None:
        self.collection_name = collection_name
        self.kind = kind

    @property
    def collection(self) -> Collection:
        return get_db()[self.collection_name]

    def read(self) -> Any:
        if self.kind == "document":
            doc = self.collection.find_one({_SINGLETON_KEY: True})
            return doc["data"] if doc else {}
        result = []
        for doc in self.collection.find({}):
            doc["id"] = doc.pop("_id")
            result.append(doc)
        return result

    def write(self, data: Any) -> None:
        self.collection.delete_many({})
        if self.kind == "document":
            self.collection.insert_one({_SINGLETON_KEY: True, "data": data})
            return
        if data:
            # Use the document's own `id` as Mongo's `_id` so there is a single
            # identifier. Shallow-copy so caller dicts are not mutated.
            docs = []
            for doc in data:
                clone = dict(doc)
                if "id" in clone:
                    clone["_id"] = clone.pop("id")
                docs.append(clone)
            self.collection.insert_many(docs)
