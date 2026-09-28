# Importing an exercise dataset

Choose the dataset separately from the training algorithm. An exercise catalog supplies the possible lifts; FitArc generates sessions from goals, constraints, plan targets, recovery, and logged performance. Prewritten workout plans are not required.

## Inputs

Use a JSON array of exercise records, plus a mapping manifest. No download, purchase, license acceptance, or third-party dataset selection is built into this change.

```json
{
  "source": "provider_name",
  "sourceUrl": "https://provider.example/dataset",
  "license": "The dataset's verified license identifier or terms URL",
  "fields": {
    "id": "exercise_id",
    "name": "name",
    "primaryMuscles": "primary_muscles",
    "secondaryMuscles": "secondary_muscles",
    "equipment": "equipment",
    "movementPattern": "movement_pattern",
    "contraindications": "contraindications",
    "fatigueCost": "fatigue_cost",
    "setupMinutes": "setup_minutes",
    "incrementKg": "increment_kg",
    "substitutionGroup": "substitution_group",
    "compound": "compound"
  },
  "aliases": {
    "primaryMuscles": { "quadriceps": "quads", "shoulders": "delts" },
    "secondaryMuscles": { "abdominals": "core" },
    "equipment": { "dumbbells": "dumbbell" }
  },
  "overrides": {}
}
```

Mappings use top-level fields. Arrays must be arrays, numeric values must be numbers, and `compound` must be boolean. Convert CSV/nested provider payloads to this shape before importing. Per-record `overrides` are keyed by the original source ID; use them for reviewed metadata the source lacks. The tool never guesses fatigue costs, load increments, contraindications, or anatomy from a name.

The resulting stable ID is `<source>_<source ID>`. Source IDs must fit the lowercase letters/digits/underscore/hyphen format; map incompatible provider IDs explicitly in your preprocessing while retaining a stable lookup. IDs cannot be derived from display names.

Supported vocabularies are exported in `src/runtime/catalogValidation.ts`. Muscles: chest, back, quads, hamstrings, glutes, delts, biceps, triceps, calves, core. Equipment: barbell, rack, machine, dumbbell, bench, cable, pullup_bar; an empty array represents no required equipment. Adding a new tag requires a deliberate app/selector update, not an unrecognized string in production data.

## Prepare a review report

```sh
npm run catalog:import -- /path/exercises.json /path/mapping.json /tmp/catalog-report.json
```

Optionally pass a fourth path containing existing canonical exercise definitions exported from the current catalog. Without it, deduplication compares against the bundled seed only.

```sh
npm run catalog:import -- /path/exercises.json /path/mapping.json /tmp/catalog-report.json /path/current-definitions.json
```

The command writes a new report file and refuses to overwrite an existing file. It does not access a database. Exit code `2` means some rows need review; valid rows are still included in `drafts`. Missing/unknown tags, missing engine metadata, duplicate IDs, and normalized duplicate names are reported per row. Near-synonyms are not automatically merged and still require editorial review.

## Load and approve

1. Review the dataset's license and each reported issue. The manifest records provenance; it does not verify legal rights automatically. Media licensing is separate and no external media is imported here.
2. Import the report's `drafts` array into `fitarc.fitarc_exercise_catalog` using an administrative SQL script or trusted backend that targets the `fitarc` schema. Its fields match the table columns. Every row has `status: "draft"` and is invisible to app clients.
3. Review muscle tags, equipment, substitutions, increments, fatigue cost, setup time, and limitations. Re-run validation after edits. Mark only reviewed rows `approved`.
4. Restart the app to fetch the approved catalog. Create or update a plan to use it. Existing plan revisions and logged sessions keep their original definitions.
5. To withdraw a lift from future catalogs, set it to `retired`; avoid reusing its ID for another movement.

Bulk import/update remains an administrative step. The CLI produces a reviewable report and has no database credentials or publish action. Duplicate IDs are flagged for an explicit update review; the importer does not overwrite the existing definition.

## Existing seed

`src/runtime/exerciseCatalog.ts` remains the bundled offline seed and landing-demo source. Regenerate its database seed using `npm run catalog:seed`; `npm run data:check` verifies parity. Imported exercises are database data, so they do not require expanding the bundled array or the landing demo.
