// Copy the app's registered map artwork and geometry without native runtime dependencies.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const write = (file, data) => fs.writeFileSync(path.join(root, file), data);
const registry = read('src/components/athleteArtwork.ts').split('export const MUSCLE_MAP_ARTWORK')[1];
const artwork = {};
for (const view of ['front', 'back']) {
  const match = registry.match(new RegExp(`${view}: require\\('([^']+)'\\)`));
  if (!match) throw new Error(`Missing ${view} artwork registration`);
  const source = path.resolve(root, 'src/components', match[1]);
  const name = path.basename(source);
  fs.copyFileSync(source, path.join(root, 'landing/public/images/muscle-map', name));
  artwork[view] = `/images/muscle-map/${name}`;
}
write('landing/lib/athleteArtwork.ts', '// Synced from the app by npm run artwork:sync.\nexport const MUSCLE_MAP_ARTWORK = ' + JSON.stringify(artwork, null, 2) + ' as const;\n');
for (const file of ['muscleMasks.ts', 'backMuscleContours.ts']) {
  const source = read(`src/screens/runtime/${file}`).replace("import type { Muscle } from '../../runtime';", 'type Muscle = string;');
  write(`landing/lib/${file}`, '// Synced from the app by npm run artwork:sync.\n' + source);
}
console.log('Synced front/back artwork and native-coordinate muscle contours.');
