import { openDB, IDBPDatabase } from 'idb';
import { Clause } from '../types/clause';
import { ContractInstance } from '../types/contract-instance';
import {
  ConflictInfo,
  ConflictStrategy,
  ImportEntityType,
  ImportPreviewResult,
  StoreImportSummary,
  TypedExportPayload
} from '../types/import-export';
import { Template } from '../types/template';
import { Version } from '../types/version';

export const DB_NAME = 'contract-template-editor';
export const DB_VERSION = 1;

export const STORE_NAMES = ['templates', 'clauses', 'instances', 'versions'] as const;
export type StoreName = (typeof STORE_NAMES)[number];

export interface StoreValueMap {
  templates: Template;
  clauses: Clause;
  instances: ContractInstance;
  versions: Version;
}

export type StoreValue<S extends StoreName> = StoreValueMap[S];

export interface ExportPayload {
  templates: Template[];
  clauses: Clause[];
  instances: ContractInstance[];
  versions: Version[];
  exportedAt: string;
}

let dbPromise: Promise<IDBPDatabase> | undefined;

export function makeId(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function nowIso() {
  return new Date().toISOString();
}

export function getDb() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        for (const storeName of STORE_NAMES) {
          if (!db.objectStoreNames.contains(storeName)) {
            db.createObjectStore(storeName, { keyPath: 'id' });
          }
        }
      }
    });
  }

  return dbPromise;
}

export async function getAllRecords<S extends StoreName>(storeName: S): Promise<StoreValue<S>[]> {
  const db = await getDb();
  return (await db.getAll(storeName)) as StoreValue<S>[];
}

export async function getRecord<S extends StoreName>(storeName: S, id: string): Promise<StoreValue<S> | undefined> {
  const db = await getDb();
  return (await db.get(storeName, id)) as StoreValue<S> | undefined;
}

export async function putRecord<S extends StoreName>(storeName: S, record: StoreValue<S>) {
  const db = await getDb();
  await db.put(storeName, record);
  return record;
}

export async function deleteRecord(storeName: StoreName, id: string) {
  const db = await getDb();
  await db.delete(storeName, id);
}

export async function clearStore(storeName: StoreName) {
  const db = await getDb();
  await db.clear(storeName);
}

export async function exportAllData(): Promise<ExportPayload> {
  const [templates, clauses, instances, versions] = await Promise.all([
    getAllRecords('templates'),
    getAllRecords('clauses'),
    getAllRecords('instances'),
    getAllRecords('versions')
  ]);

  return {
    templates,
    clauses,
    instances,
    versions,
    exportedAt: nowIso()
  };
}

export async function importAllData(payload: Partial<ExportPayload>) {
  const db = await getDb();
  const tx = db.transaction(STORE_NAMES, 'readwrite');

  for (const storeName of STORE_NAMES) {
    const store = tx.objectStore(storeName);
    await store.clear();
    const records = (payload[storeName] ?? []) as StoreValue<typeof storeName>[];
    for (const record of records) {
      await store.put(record);
    }
  }

  await tx.done;
}

export async function exportByType(types: ImportEntityType[]): Promise<TypedExportPayload> {
  const promises: Promise<unknown>[] = [];
  const result: TypedExportPayload = {
    exportedAt: nowIso(),
    exportedTypes: types
  };

  if (types.includes('templates')) {
    promises.push(
      getAllRecords('templates').then((data) => {
        result.templates = data;
      })
    );
  }
  if (types.includes('clauses')) {
    promises.push(
      getAllRecords('clauses').then((data) => {
        result.clauses = data;
      })
    );
  }
  if (types.includes('instances')) {
    promises.push(
      Promise.all([getAllRecords('instances'), getAllRecords('versions')]).then(([instances, versions]) => {
        result.instances = instances;
        result.versions = versions;
      })
    );
  }

  await Promise.all(promises);
  return result;
}

function getItemTitle(storeName: StoreName, item: StoreValue<typeof storeName>): string {
  if ('title' in item && typeof item.title === 'string') {
    return item.title;
  }
  return item.id;
}

export async function analyzeImportConflicts(
  payload: TypedExportPayload,
  selectedTypes: ImportEntityType[]
): Promise<ImportPreviewResult> {
  const conflicts: ConflictInfo[] = [];
  const newItems: Array<{ storeName: StoreName; id: string; title: string }> = [];
  const summaries: StoreImportSummary[] = [];
  let totalCount = 0;
  let conflictCount = 0;
  let newCount = 0;

  for (const type of selectedTypes) {
    const storeName = type as StoreName;
    const incomingItems = (payload[storeName] ?? []) as StoreValue<typeof storeName>[];
    const existingItems = await getAllRecords(storeName);
    const existingMap = new Map(existingItems.map((item) => [item.id, item]));

    const summary: StoreImportSummary = {
      storeName,
      total: incomingItems.length,
      newCount: 0,
      conflictCount: 0,
      skippedCount: 0,
      overwrittenCount: 0
    };

    for (const item of incomingItems) {
      totalCount++;
      const existing = existingMap.get(item.id);
      const title = getItemTitle(storeName, item);

      if (existing) {
        conflictCount++;
        summary.conflictCount++;
        conflicts.push({
          storeName,
          id: item.id,
          title,
          existing,
          incoming: item,
          strategy: 'skip'
        });
      } else {
        newCount++;
        summary.newCount++;
        newItems.push({ storeName, id: item.id, title });
      }
    }

    summaries.push(summary);
  }

  return {
    summaries,
    conflicts,
    newItems,
    totalCount,
    conflictCount,
    newCount
  };
}

export async function importByType(
  payload: TypedExportPayload,
  selectedTypes: ImportEntityType[],
  conflictStrategies: Map<string, ConflictStrategy>,
  defaultStrategy: ConflictStrategy
): Promise<StoreImportSummary[]> {
  const db = await getDb();
  const storesToProcess: StoreName[] = selectedTypes as StoreName[];

  if (selectedTypes.includes('instances') && payload.versions?.length) {
    storesToProcess.push('versions');
  }

  const tx = db.transaction(storesToProcess, 'readwrite');
  const summaries: StoreImportSummary[] = [];

  for (const type of selectedTypes) {
    const storeName = type as StoreName;
    const store = tx.objectStore(storeName);
    const incomingItems = (payload[storeName] ?? []) as StoreValue<typeof storeName>[];

    const summary: StoreImportSummary = {
      storeName,
      total: incomingItems.length,
      newCount: 0,
      conflictCount: 0,
      skippedCount: 0,
      overwrittenCount: 0
    };

    for (const item of incomingItems) {
      const conflictKey = `${storeName}:${item.id}`;
      const strategy = conflictStrategies.get(conflictKey) ?? defaultStrategy;
      const existing = await store.get(item.id);

      if (existing) {
        summary.conflictCount++;
        if (strategy === 'overwrite') {
          summary.overwrittenCount++;
          await store.put(item);
        } else {
          summary.skippedCount++;
        }
      } else {
        summary.newCount++;
        await store.put(item);
      }
    }

    summaries.push(summary);
  }

  if (selectedTypes.includes('instances') && payload.versions?.length) {
    const versionStore = tx.objectStore('versions');
    const existingVersionIds = new Set((await versionStore.getAll()).map((v) => v.id));

    for (const version of payload.versions) {
      if (!existingVersionIds.has(version.id)) {
        await versionStore.put(version);
      }
    }
  }

  await tx.done;
  return summaries;
}
