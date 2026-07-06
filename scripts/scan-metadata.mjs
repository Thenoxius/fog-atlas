// One-off scan of assets/Battlemaps for embedded EXIF/IPTC/XMP author or
// copyright metadata, to see whether any source images identify their
// creator. Not part of the build; run manually and inspect the report.

import { readdir } from 'node:fs/promises';
import path from 'node:path';
import exifr from 'exifr';

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC_DIR = path.join(ROOT, 'assets', 'Battlemaps');
const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']);

async function collectImages(dir, folder = '') {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await collectImages(full, folder ? `${folder}/${entry.name}` : entry.name)));
    } else if (IMAGE_EXT.has(path.extname(entry.name).toLowerCase())) {
      out.push({ full, folder, name: entry.name });
    }
  }
  return out;
}

const images = await collectImages(SRC_DIR);
console.log(`Scanning ${images.length} images for embedded metadata...`);

const byFolder = new Map();
let withMeta = 0;

for (const img of images) {
  let meta;
  try {
    meta = await exifr.parse(img.full, {
      iptc: true,
      xmp: true,
      exif: true,
      tiff: true,
      translateKeys: true,
    });
  } catch {
    continue;
  }
  if (!meta) continue;

  const interesting = {};
  for (const key of [
    'Artist', 'Copyright', 'Creator', 'CreatorTool', 'Author', 'By-line', 'Byline',
    'CopyrightNotice', 'Credit', 'Rights', 'Software', 'Producer', 'Make', 'Marked',
    'WebStatement', 'UsageTerms', 'Source',
  ]) {
    if (meta[key] !== undefined && meta[key] !== null && meta[key] !== '') {
      interesting[key] = meta[key];
    }
  }

  if (Object.keys(interesting).length > 0) {
    withMeta++;
    if (!byFolder.has(img.folder)) byFolder.set(img.folder, []);
    byFolder.get(img.folder).push({ name: img.name, ...interesting });
  }
}

console.log(`\n${withMeta} of ${images.length} images had any relevant metadata field.\n`);

if (byFolder.size === 0) {
  console.log('No creator-identifying metadata found in any file.');
} else {
  for (const [folder, entries] of byFolder) {
    console.log(`\n=== ${folder} (${entries.length} files with metadata) ===`);
    for (const e of entries.slice(0, 5)) {
      console.log(`  ${e.name}:`, JSON.stringify({ ...e, name: undefined }));
    }
    if (entries.length > 5) console.log(`  ...and ${entries.length - 5} more`);
  }
}
