import json
from pathlib import Path
from typing import Any

from filelock import FileLock


class JsonRepository:
    def __init__(self, file_path: Path) -> None:
        self.file_path = file_path
        self.lock_path = file_path.with_suffix(f"{file_path.suffix}.lock")
        self.file_path.parent.mkdir(parents=True, exist_ok=True)
        if not self.file_path.exists():
            self.write([])

    def read(self) -> Any:
        with FileLock(str(self.lock_path)):
            with self.file_path.open("r", encoding="utf-8") as file:
                return json.load(file)

    def write(self, data: Any) -> None:
        with FileLock(str(self.lock_path)):
            with self.file_path.open("w", encoding="utf-8") as file:
                json.dump(data, file, ensure_ascii=False, indent=2)
