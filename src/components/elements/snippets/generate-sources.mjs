// Usage (from repo root): node src/components/elements/snippets/generate-sources.mjs .
// Generates src/components/elements/snippets/library-sources.ts from the library components,
// so the TSX code panels are byte-for-byte the code that renders each specimen.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
const root = process.argv[2];
const lib = join(root, 'src/components/elements/library');
const files = readdirSync(lib).filter((f) => f.endsWith('.tsx')).sort();
let out = '// AUTO-GENERATED from ../library/*.tsx — do not edit by hand.\n// Regenerate after changing a library component: node src/components/elements/snippets/generate-sources.mjs .\n\n';
for (const f of files) {
  const name = f.replace(/\.tsx$/, '');
  out += `export const ${name}Source = ${JSON.stringify(readFileSync(join(lib, f), 'utf8'))};\n\n`;
}
writeFileSync(join(root, 'src/components/elements/snippets/library-sources.ts'), out);
console.log('wrote', files.length, 'sources');
