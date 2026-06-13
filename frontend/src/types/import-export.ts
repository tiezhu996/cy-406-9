import { StoreName, StoreValueMap } from '../utils/db';

export type ImportEntityType = 'templates' | 'clauses' | 'instances';

export const IMPORT_ENTITY_LABELS: Record<ImportEntityType, string> = {
  templates: '模板',
  clauses: '条款',
  instances: '实例'
};

export type ConflictStrategy = 'overwrite' | 'skip';

export interface ConflictInfo<S extends StoreName = StoreName> {
  storeName: S;
  id: string;
  title: string;
  existing: StoreValueMap[S];
  incoming: StoreValueMap[S];
  strategy: ConflictStrategy;
}

export interface StoreImportSummary<S extends StoreName = StoreName> {
  storeName: S;
  total: number;
  newCount: number;
  conflictCount: number;
  skippedCount: number;
  overwrittenCount: number;
}

export interface ImportPreviewResult {
  summaries: StoreImportSummary[];
  conflicts: ConflictInfo[];
  newItems: Array<{ storeName: StoreName; id: string; title: string }>;
  totalCount: number;
  conflictCount: number;
  newCount: number;
}

export interface ImportOptions {
  selectedTypes: ImportEntityType[];
  conflictStrategies: Map<string, ConflictStrategy>;
  defaultStrategy: ConflictStrategy;
}

export interface TypedExportPayload {
  templates?: StoreValueMap['templates'][];
  clauses?: StoreValueMap['clauses'][];
  instances?: StoreValueMap['instances'][];
  versions?: StoreValueMap['versions'][];
  exportedAt: string;
  exportedTypes: ImportEntityType[];
}
