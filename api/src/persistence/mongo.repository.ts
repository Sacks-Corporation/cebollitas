import { Collection, Db, Document, MongoClient } from 'mongodb';
import { getEnv, getEnvOr } from '../config/env';
import { Repository } from './repository';

let client: MongoClient | null = null;

export function getMongoClient(): MongoClient {
  if (!client) {
    const uri = getEnv('MONGODB_URI');
    if (!uri) throw new Error('MONGODB_URI is not configured');
    client = new MongoClient(uri);
  }
  return client;
}

export async function closeMongoClient(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
  }
}

function getDb(): Db {
  return getMongoClient().db(getEnvOr('MONGODB_DB', 'cebollitas'));
}

/** Collections whose JSON root is a single object rather than a list of documents. */
export const COLLECTION_KINDS: Record<string, 'list' | 'document'> = {
  monthly_assignments: 'document',
};

const SINGLETON_KEY = '_singleton';

/**
 * Drop-in replacement for JsonRepository backed by a MongoDB collection,
 * storing exactly the same document shapes as the Python MongoRepository:
 * - kind "list": one document per element, the element's `id` used as `_id`.
 * - kind "document": the whole object inside `{_singleton: true, data}`.
 * `write` replaces the whole collection (not atomic, same as before).
 */
export class MongoRepository<T = any> implements Repository<T> {
  constructor(
    private readonly collectionName: string,
    private readonly kind: 'list' | 'document' = 'list',
  ) {}

  private get collection(): Collection<Document> {
    return getDb().collection(this.collectionName);
  }

  async read(): Promise<T> {
    if (this.kind === 'document') {
      const doc = await this.collection.findOne({ [SINGLETON_KEY]: true });
      return (doc ? doc.data : {}) as T;
    }
    const docs = await this.collection.find({}).toArray();
    return docs.map((doc) => {
      const { _id, ...rest } = doc;
      return { ...rest, id: _id };
    }) as T;
  }

  async write(data: T): Promise<void> {
    await this.collection.deleteMany({});
    if (this.kind === 'document') {
      await this.collection.insertOne({ [SINGLETON_KEY]: true, data });
      return;
    }
    const items = data as unknown as Array<Record<string, unknown>>;
    if (items && items.length) {
      const docs = items.map((item) => {
        const { id, ...rest } = item;
        return 'id' in item ? { _id: id, ...rest } : { ...rest };
      });
      await this.collection.insertMany(docs as Document[]);
    }
  }
}
