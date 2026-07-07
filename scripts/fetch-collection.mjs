// Fetches the bundled map collection (public/collection/ — not tracked in
// this repo) from the companion github.com/Thenoxius/fog-atlas-collection
// repo. Run manually for local dev (npm run collection:fetch); the GitHub
// Actions deploy workflow does the equivalent via actions/checkout instead.

import { cp, rm, mkdir } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const TMP_DIR = path.join(ROOT, '.collection-src');
const OUT_DIR = path.join(ROOT, 'public', 'collection');
const REPO_URL = 'https://github.com/Thenoxius/fog-atlas-collection.git';

await rm(TMP_DIR, { recursive: true, force: true });
console.log(`Cloning ${REPO_URL}...`);
execSync(`git clone --depth 1 ${REPO_URL} "${TMP_DIR}"`, { stdio: 'inherit' });

await rm(OUT_DIR, { recursive: true, force: true });
await mkdir(OUT_DIR, { recursive: true });
await cp(path.join(TMP_DIR, 'collection'), OUT_DIR, { recursive: true });
await rm(TMP_DIR, { recursive: true, force: true });

console.log(`Collection fetched into ${path.relative(ROOT, OUT_DIR)}`);
