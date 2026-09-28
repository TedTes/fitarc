import type { ExerciseDefinition } from './types';
import { validateExercise } from './catalogValidation';

export type ImportManifest = {
  source: string;
  sourceUrl: string;
  license: string;
  /** Canonical field -> source field. Engine metadata missing in a dataset needs explicit overrides. */
  fields: Partial<Record<keyof ExerciseDefinition, string>> & { id: string; name: string };
  aliases?: Partial<Record<'primaryMuscles' | 'secondaryMuscles' | 'equipment' | 'contraindications' | 'movementPattern', Record<string, string>>>;
  overrides?: Record<string, Partial<ExerciseDefinition>>;
};
export type CatalogDraft = {
  id: string; source: string; source_id: string; source_url: string; license: string;
  status: 'draft'; definition: ExerciseDefinition;
};
export function prepareCatalogImport(rows: Record<string, unknown>[], manifest: ImportManifest, existing: ExerciseDefinition[] = []) {
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(manifest.source) || !manifest.sourceUrl || !manifest.license) throw new Error('Source identifier, URL and license are required.');
  if (!manifest.fields?.id || !manifest.fields.name) throw new Error('Map the source ID and name fields.');
  const drafts: CatalogDraft[] = [];
  const issues: Array<{ row: number; sourceId: string; errors: string[] }> = [];
  const seenIds = new Set(existing.map((entry) => entry.id));
  const seenNames = new Set(existing.map((entry) => entry.name.trim().toLowerCase().replace(/\s+/g, ' ')));
  rows.forEach((row, index) => {
    const sourceId = String(row[manifest.fields.id] ?? '');
    const mapped: Record<string, unknown> = {};
    for (const [key, field] of Object.entries(manifest.fields)) mapped[key] = row[field];
    for (const [key, aliases] of Object.entries(manifest.aliases ?? {})) {
      const translate = (tag: unknown) => aliases[String(tag)] ?? tag;
      mapped[key] = Array.isArray(mapped[key]) ? (mapped[key] as unknown[]).map(translate) : translate(mapped[key]);
    }
    Object.assign(mapped, manifest.overrides?.[sourceId] ?? {});
    // Source IDs remain stable across repeated imports; IDs are never derived from changing names.
    mapped.id = `${manifest.source}_${sourceId}`;
    const errors = validateExercise(mapped);
    if (!sourceId) errors.push('Source ID is missing.');
    const name = String(mapped.name ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
    if (seenIds.has(String(mapped.id))) errors.push('Duplicate ID; review as an update instead of importing a second exercise.');
    if (seenNames.has(name)) errors.push('Duplicate name; review whether this is the same exercise.');
    if (errors.length) { issues.push({ row: index + 1, sourceId, errors }); return; }
    seenIds.add(String(mapped.id)); seenNames.add(name);
    drafts.push({ id: String(mapped.id), source: manifest.source, source_id: sourceId,
      source_url: manifest.sourceUrl, license: manifest.license, status: 'draft', definition: mapped as ExerciseDefinition });
  });
  return { drafts, issues };
}
