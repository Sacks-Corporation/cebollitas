import { Mutex } from 'async-mutex';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { Repository } from './repository';

/** One mutex per file so concurrent requests never interleave a read and a write. */
const LOCKS = new Map<string, Mutex>();

function lockFor(filePath: string): Mutex {
  let lock = LOCKS.get(filePath);
  if (!lock) {
    lock = new Mutex();
    LOCKS.set(filePath, lock);
  }
  return lock;
}

/** Same on-disk format as Python's `json.dump(data, f, ensure_ascii=False, indent=2)`. */
export function serializeJson(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

export class JsonRepository<T = any> implements Repository<T> {
  private readonly lock: Mutex;

  constructor(private readonly filePath: string) {
    this.lock = lockFor(path.resolve(filePath));
    mkdirSync(path.dirname(filePath), { recursive: true });
    if (!existsSync(filePath)) writeFileSync(filePath, serializeJson([]), 'utf-8');
  }

  read(): Promise<T> {
    return this.lock.runExclusive(async () => JSON.parse(await readFile(this.filePath, 'utf-8')) as T);
  }

  write(data: T): Promise<void> {
    return this.lock.runExclusive(() => writeFile(this.filePath, serializeJson(data), 'utf-8'));
  }
}
