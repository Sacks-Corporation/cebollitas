import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import * as path from 'node:path';
import { BUNDLED_DATA_DIR, dataDir, useMongo } from '../config/env';
import { JsonRepository } from './json.repository';
import { closeMongoClient, COLLECTION_KINDS, MongoRepository } from './mongo.repository';
import { Repository } from './repository';

/** Role granted to every allowed user that has no explicit roles yet. */
export const DEFAULT_ROLE = 'CEBOLLITAS';

export const COLLECTIONS = [
  'allowed_users',
  'roles',
  'matches',
  'cebollitas_matches',
  'monthly_assignments',
  'events',
  'trips',
  'votes',
] as const;
export type CollectionName = (typeof COLLECTIONS)[number];

export type Dict = Record<string, any>;

/**
 * Port of `repositories/data_store.py`: one repository per collection, backed
 * by JSON files (default) or MongoDB when `MONGODB_URI` is set, plus first-boot
 * seeding from the bundled JSON files. Route/service code must go through
 * this service and never touch files or Mongo directly.
 */
@Injectable()
export class DataStoreService implements OnModuleInit, OnModuleDestroy {
  private readonly mongo = useMongo();
  private readonly repos: Record<CollectionName, Repository>;

  constructor() {
    if (!this.mongo) this.seedDataDir();
    this.repos = Object.fromEntries(COLLECTIONS.map((name) => [name, this.makeRepo(name)])) as Record<
      CollectionName,
      Repository
    >;
  }

  async onModuleInit(): Promise<void> {
    if (this.mongo) await this.seedMongo();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.mongo) await closeMongoClient();
  }

  get allowedUsersRepo(): Repository<Dict[]> {
    return this.repos.allowed_users;
  }
  get rolesRepo(): Repository<Dict[]> {
    return this.repos.roles;
  }
  get matchesRepo(): Repository<Dict[]> {
    return this.repos.matches;
  }
  get cebollitasMatchesRepo(): Repository<Dict[]> {
    return this.repos.cebollitas_matches;
  }
  get monthlyAssignmentsRepo(): Repository<Record<string, string>> {
    return this.repos.monthly_assignments;
  }
  get eventsRepo(): Repository<Dict[]> {
    return this.repos.events;
  }
  get tripsRepo(): Repository<Dict[]> {
    return this.repos.trips;
  }
  get votesRepo(): Repository<Dict[]> {
    return this.repos.votes;
  }

  /** Allowed users, backfilling a missing `id` or `roles` (and persisting the fix). */
  async getAllowedUsers(): Promise<Dict[]> {
    const users = await this.allowedUsersRepo.read();
    let changed = false;
    for (const user of users) {
      if (!user.id) {
        user.id = randomUUID();
        changed = true;
      }
      if (!user.roles || user.roles.length === 0) {
        user.roles = [DEFAULT_ROLE];
        changed = true;
      }
    }
    if (changed) await this.allowedUsersRepo.write(users);
    return users;
  }

  getRoles(): Promise<Dict[]> {
    return this.rolesRepo.read();
  }

  getMatches(): Promise<Dict[]> {
    return this.matchesRepo.read();
  }

  getCebollitasMatches(): Promise<Dict[]> {
    return this.cebollitasMatchesRepo.read();
  }

  private makeRepo(name: CollectionName): Repository {
    if (this.mongo) return new MongoRepository(name, COLLECTION_KINDS[name] ?? 'list');
    return new JsonRepository(path.join(dataDir(), `${name}.json`));
  }

  /**
   * Copies the bundled seed JSON files into DATA_DIR on first boot. Existing
   * files are never overwritten, so data on a persistent volume survives deploys.
   */
  private seedDataDir(): void {
    const target = dataDir();
    if (path.resolve(target) === path.resolve(BUNDLED_DATA_DIR)) return;
    mkdirSync(target, { recursive: true });
    if (!existsSync(BUNDLED_DATA_DIR)) return;
    for (const file of readdirSync(BUNDLED_DATA_DIR)) {
      if (!file.endsWith('.json')) continue;
      const destination = path.join(target, file);
      if (!existsSync(destination)) copyFileSync(path.join(BUNDLED_DATA_DIR, file), destination);
    }
  }

  /** Seeds empty Mongo collections from the bundled JSON files on first boot. */
  private async seedMongo(): Promise<void> {
    for (const name of COLLECTIONS) {
      const seedFile = path.join(BUNDLED_DATA_DIR, `${name}.json`);
      if (!existsSync(seedFile)) continue;
      const current = await this.repos[name].read();
      if (isTruthy(current)) continue;
      await this.repos[name].write(JSON.parse(readFileSync(seedFile, 'utf-8')));
    }
  }
}

/** Python truthiness for the values a repository returns (list or dict). */
function isTruthy(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === 'object') return Object.keys(value).length > 0;
  return Boolean(value);
}
