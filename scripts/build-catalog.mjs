// Builds public/catalog.json for the dashboard: every test the runner would
// run, with its file, title path, tags and source line, plus the environments.
// Runs on Vercel at build time (see vercel.json), so the dashboard always
// lists exactly the tests that were pushed. Nothing starts: `list` only
// collects, the same way `npx e2e list` does.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { list } from 'e2e/runner';

const root = path.resolve(import.meta.dirname, '..');
const { pairs } = await list({ cwd: root });

const tests = pairs
  .filter((pair) => pair.kind === 'test' && pair.disposition !== 'filtered')
  .map((pair) => ({
    id: pair.id,
    file: pair.file,
    line: pair.source?.line ?? null,
    titlePath: pair.titlePath,
    tags: pair.tags,
    skipped: pair.disposition === 'skip',
    usesAgent: pair.tags.includes('agent')
  }));

const environments = JSON.parse(readFileSync(path.join(root, 'environments.json'), 'utf8'));

mkdirSync(path.join(root, 'public'), { recursive: true });
writeFileSync(
  path.join(root, 'public', 'catalog.json'),
  JSON.stringify({ builtAt: new Date().toISOString(), environments, tests }, null, 1)
);
console.log(`catalog: ${tests.length} tests in ${new Set(tests.map((t) => t.file)).size} files`);
