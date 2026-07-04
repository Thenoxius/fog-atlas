// Builds the bundled map collection from the DM's local originals.
//
//   assets/Battlemaps/<Series>/<Map>.{jpg,jpeg,png,webp}
//     -> public/collection/maps/<slug>.webp    (max 3000px, q78 — table-ready)
//     -> public/collection/thumbs/<slug>.webp  (360px wide — browsing grid)
//     -> public/collection/manifest.json
//
// The originals in assets/ are gitignored (2.4+ GB doesn't fit GitHub or
// Pages); only these optimized copies ship with the repo. Re-run after
// adding maps: node scripts/build-collection.mjs
// Incremental: existing outputs are skipped unless the source is newer.

import { readdir, stat, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC_DIR = path.join(ROOT, 'assets', 'Battlemaps');
const OUT_DIR = path.join(ROOT, 'public', 'collection');
const MAPS_DIR = path.join(OUT_DIR, 'maps');
const THUMBS_DIR = path.join(OUT_DIR, 'thumbs');

const MAX_DIM = 3000;
const MAP_QUALITY = 78;
const THUMB_WIDTH = 360;
const THUMB_QUALITY = 70;
const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']);

function cleanName(fileBase) {
  return fileBase
    .replace(/@?\s*\d+\s*pps/gi, '')
    .replace(/\b\d+x\d+\b/gi, '')
    .replace(/_/g, "'")
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([).])/g, '$1')
    .trim()
    .replace(/[\s(@-]+$/, '');
}

function parsePps(fileBase) {
  const match = fileBase.match(/@?\s*(\d+)\s*pps/i);
  return match ? Number(match[1]) : null;
}

function parseGrid(fileBase) {
  const match = fileBase.match(/\b(\d+)x(\d+)\b/);
  return match ? { w: Number(match[1]), h: Number(match[2]) } : null;
}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function collectImages(dir, folder = '') {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await collectImages(full, folder ? `${folder}/${entry.name}` : entry.name)));
    } else if (IMAGE_EXT.has(path.extname(entry.name).toLowerCase())) {
      out.push({ full, folder, base: path.basename(entry.name, path.extname(entry.name)) });
    }
  }
  return out;
}

const images = await collectImages(SRC_DIR);
console.log(`Found ${images.length} source images`);
await mkdir(MAPS_DIR, { recursive: true });
await mkdir(THUMBS_DIR, { recursive: true });

const manifest = [];
const usedSlugs = new Set();
let converted = 0;
let skipped = 0;
let failed = 0;

for (const image of images) {
  const name = cleanName(image.base);
  let slug = slugify(`${image.folder.split('/')[0]}-${name}`) || 'map';
  while (usedSlugs.has(slug)) slug += '-2';
  usedSlugs.add(slug);

  const mapOut = path.join(MAPS_DIR, `${slug}.webp`);
  const thumbOut = path.join(THUMBS_DIR, `${slug}.webp`);

  try {
    const srcStat = await stat(image.full);
    const upToDate =
      existsSync(mapOut) && existsSync(thumbOut) && (await stat(mapOut)).mtimeMs > srcStat.mtimeMs;

    let outWidth;
    let outHeight;
    let srcWidth;

    if (upToDate) {
      const meta = await sharp(mapOut).metadata();
      outWidth = meta.width;
      outHeight = meta.height;
      srcWidth = (await sharp(image.full).metadata()).width;
      skipped++;
    } else {
      const source = sharp(image.full, { limitInputPixels: false });
      const meta = await source.metadata();
      srcWidth = meta.width;

      const info = await source
        .clone()
        .resize({ width: MAX_DIM, height: MAX_DIM, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: MAP_QUALITY })
        .toFile(mapOut);
      outWidth = info.width;
      outHeight = info.height;

      await source
        .clone()
        .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
        .webp({ quality: THUMB_QUALITY })
        .toFile(thumbOut);
      converted++;
      if (converted % 50 === 0) console.log(`  converted ${converted}...`);
    }

    const srcPps = parsePps(image.base);
    // Grid size in the *optimized* image scales with the resize factor
    const pps = srcPps && srcWidth ? Math.round((srcPps * outWidth) / srcWidth) : null;
    const grid = parseGrid(image.base);

    manifest.push({
      id: slug,
      name,
      folder: image.folder.split('/')[0],
      file: `maps/${slug}.webp`,
      thumb: `thumbs/${slug}.webp`,
      width: outWidth,
      height: outHeight,
      pps,
      gridW: grid ? grid.w : null,
      gridH: grid ? grid.h : null,
    });
  } catch (err) {
    failed++;
    console.error(`FAILED: ${image.folder}/${image.base}: ${err.message}`);
  }
}

manifest.sort((a, b) => a.folder.localeCompare(b.folder) || a.name.localeCompare(b.name));
await writeFile(path.join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 1));

const { execSync } = await import('node:child_process');
console.log(`Done: ${converted} converted, ${skipped} up to date, ${failed} failed, ${manifest.length} in manifest`);
try {
  const size = execSync(
    process.platform === 'win32'
      ? `powershell -Command "[math]::Round((Get-ChildItem '${OUT_DIR}' -Recurse -File | Measure-Object Length -Sum).Sum/1MB,1)"`
      : `du -sm '${OUT_DIR}' | cut -f1`
  )
    .toString()
    .trim();
  console.log(`Collection size: ${size} MB`);
} catch {
  // size report is informational only
}
