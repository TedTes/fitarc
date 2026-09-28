require('./lib/load-typescript.cjs');
const fs = require('node:fs');
const { prepareCatalogImport } = require('../src/runtime/catalogImport.ts');
const { RUNTIME_EXERCISES } = require('../src/runtime/exerciseCatalog.ts');
const [datasetPath, manifestPath, outputPath, existingPath] = process.argv.slice(2);
if (!datasetPath || !manifestPath || !outputPath) {
  console.error('Usage: node scripts/import-exercises.cjs dataset.json mapping.json report.json [existing-definitions.json]');
  process.exit(1);
}
const rows = JSON.parse(fs.readFileSync(datasetPath, 'utf8'));
if (!Array.isArray(rows)) throw new Error('Dataset must be a JSON array.');
const report = prepareCatalogImport(rows, JSON.parse(fs.readFileSync(manifestPath, 'utf8')),
  existingPath ? JSON.parse(fs.readFileSync(existingPath, 'utf8')) : RUNTIME_EXERCISES);
fs.writeFileSync(outputPath, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(`${report.drafts.length} validated drafts; ${report.issues.length} rows require review. Report: ${outputPath}`);
if (report.issues.length) process.exitCode = 2;
