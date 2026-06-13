import { ImportEntityType, IMPORT_ENTITY_LABELS, TypedExportPayload } from '../types/import-export';
import { ExportPayload } from './db';

export function generateExportFilename(types: ImportEntityType[]): string {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  if (types.length === 3) {
    return `contract-editor-full-${dateStr}.json`;
  }
  const typeNames = types.map((t) => IMPORT_ENTITY_LABELS[t]).join('-');
  return `contract-editor-${typeNames}-${dateStr}.json`;
}

export function downloadJson(payload: ExportPayload | TypedExportPayload, filename = 'contract-editor-data.json') {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function readJsonFile<T>(file: File): Promise<T> {
  const text = await file.text();
  return JSON.parse(text) as T;
}

export function detectPayloadTypes(payload: Record<string, unknown>): ImportEntityType[] {
  const types: ImportEntityType[] = [];
  if (Array.isArray(payload.templates) && payload.templates.length > 0) {
    types.push('templates');
  }
  if (Array.isArray(payload.clauses) && payload.clauses.length > 0) {
    types.push('clauses');
  }
  if (Array.isArray(payload.instances) && payload.instances.length > 0) {
    types.push('instances');
  }
  return types;
}
