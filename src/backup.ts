// Full-library backup as a plain zip archive: a manifest.json describing
// every record plus each image/fog/portrait blob as its own file entry.
// Hand-rolled (store-only writer) to keep the app dependency-free — the
// images are already compressed, so the archive skips recompression and
// stays fast. The reader also accepts deflated entries (via the browser's
// DecompressionStream) in case a user re-zips an edited backup.
//
// This is the safety net for local-first data, and the bridge for moving a
// library between browsers, devices, or origins (e.g. a future domain move).

import {
  listMaps,
  listCharacters,
  listSavedEncounters,
  getEncounter,
  putMap,
  putCharacter,
  saveEncounter,
  saveSavedEncounter,
  type MapRecord,
  type Character,
  type Encounter,
  type SavedEncounter,
} from './db';

const MANIFEST_NAME = 'manifest.json';

interface BlobRef {
  path: string;
  type: string;
}

interface BackupManifest {
  app: 'fog-atlas';
  version: 1;
  exportedAt: string;
  // Records carry their blob fields replaced by { path, type } references.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  maps: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  characters: any[];
  encounter: Encounter | null;
  savedEncounters: SavedEncounter[];
}

export interface RestoreSummary {
  maps: number;
  characters: number;
  savedEncounters: number;
  encounterRestored: boolean;
}

/* ------------------------------------------------------------- CRC32 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/* ------------------------------------------------------- zip writing */

interface ZipEntry {
  name: string;
  bytes: Uint8Array;
}

/** Minimal ZIP32 writer, method 0 (store) only. */
function buildZip(entries: ZipEntry[]): Blob {
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const crc = crc32(entry.bytes);
    const size = entry.bytes.length;

    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true); // version needed
    lv.setUint16(6, 0, true); // flags
    lv.setUint16(8, 0, true); // method: store
    lv.setUint16(10, 0, true); // time
    lv.setUint16(12, 0x21, true); // date (1980-01-01)
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true);
    lv.setUint32(22, size, true);
    lv.setUint16(26, name.length, true);
    lv.setUint16(28, 0, true);
    local.set(name, 30);

    const cdir = new Uint8Array(46 + name.length);
    const cv = new DataView(cdir.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true); // version made by
    cv.setUint16(6, 20, true); // version needed
    cv.setUint16(8, 0, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, 0, true);
    cv.setUint16(14, 0x21, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true); // local header offset
    cdir.set(name, 46);

    parts.push(local, entry.bytes);
    central.push(cdir);
    offset += local.length + size;
  }

  const cdSize = central.reduce((s, c) => s + c.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);

  // Every part here is ArrayBuffer-backed (never SharedArrayBuffer); the
  // cast bridges TS 6's stricter Uint8Array<ArrayBufferLike> vs BlobPart.
  return new Blob([...parts, ...central, eocd] as BlobPart[], { type: 'application/zip' });
}

/* ------------------------------------------------------- zip reading */

async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Read a zip produced by buildZip (or re-zipped by common tools). */
async function readZip(file: Blob): Promise<Map<string, Uint8Array>> {
  const buf = new Uint8Array(await file.arrayBuffer());
  const view = new DataView(buf.buffer);

  // Find the end-of-central-directory record (scan back past any comment).
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('Not a zip archive');

  const count = view.getUint16(eocd + 10, true);
  let pos = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();
  const entries = new Map<string, Uint8Array>();

  for (let i = 0; i < count; i++) {
    if (view.getUint32(pos, true) !== 0x02014b50) throw new Error('Corrupt central directory');
    const method = view.getUint16(pos + 10, true);
    const csize = view.getUint32(pos + 20, true);
    const nameLen = view.getUint16(pos + 28, true);
    const extraLen = view.getUint16(pos + 30, true);
    const commentLen = view.getUint16(pos + 32, true);
    const localOffset = view.getUint32(pos + 42, true);
    const name = decoder.decode(buf.subarray(pos + 46, pos + 46 + nameLen));

    // The local header's own name/extra lengths decide where data starts.
    const lNameLen = view.getUint16(localOffset + 26, true);
    const lExtraLen = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + lNameLen + lExtraLen;
    const raw = buf.subarray(dataStart, dataStart + csize);

    if (method === 0) entries.set(name, raw);
    else if (method === 8) entries.set(name, await inflateRaw(raw));
    else throw new Error(`Unsupported compression method ${method} for ${name}`);

    pos += 46 + nameLen + extraLen + commentLen;
  }

  return entries;
}

/* --------------------------------------------------- export / import */

export async function buildBackup(): Promise<Blob> {
  const [maps, characters, savedEncounters, encounter] = await Promise.all([
    listMaps(),
    listCharacters(),
    listSavedEncounters(),
    getEncounter(),
  ]);

  const entries: ZipEntry[] = [];
  let blobIndex = 0;

  const addBlob = async (blob: Blob): Promise<BlobRef> => {
    const path = `blobs/${blobIndex++}`;
    entries.push({ name: path, bytes: new Uint8Array(await blob.arrayBuffer()) });
    return { path, type: blob.type };
  };

  const manifest: BackupManifest = {
    app: 'fog-atlas',
    version: 1,
    exportedAt: new Date().toISOString(),
    maps: [],
    characters: [],
    encounter: encounter ?? null,
    savedEncounters,
  };

  for (const m of maps) {
    manifest.maps.push({
      ...m,
      image: await addBlob(m.image),
      fog: m.fog ? await addBlob(m.fog) : null,
      thumbnail: await addBlob(m.thumbnail),
    });
  }

  for (const c of characters) {
    manifest.characters.push({
      ...c,
      portrait: c.portrait ? await addBlob(c.portrait) : null,
    });
  }

  entries.unshift({
    name: MANIFEST_NAME,
    bytes: new TextEncoder().encode(JSON.stringify(manifest)),
  });

  return buildZip(entries);
}

/** Merge a backup into the local stores: records with the same id are
 * overwritten, everything else is left untouched — never deletes. */
export async function restoreBackup(file: Blob): Promise<RestoreSummary> {
  const entries = await readZip(file);
  const manifestBytes = entries.get(MANIFEST_NAME);
  if (!manifestBytes) throw new Error('No manifest.json — this is not a Fog Atlas backup');

  const manifest = JSON.parse(new TextDecoder().decode(manifestBytes)) as BackupManifest;
  if (manifest.app !== 'fog-atlas') throw new Error('This is not a Fog Atlas backup');
  if (manifest.version !== 1) throw new Error(`Unsupported backup version ${manifest.version}`);

  const toBlob = (ref: BlobRef | null): Blob | null => {
    if (!ref) return null;
    const bytes = entries.get(ref.path);
    if (!bytes) throw new Error(`Backup is missing ${ref.path}`);
    return new Blob([bytes.slice()], { type: ref.type || 'application/octet-stream' });
  };

  const summary: RestoreSummary = { maps: 0, characters: 0, savedEncounters: 0, encounterRestored: false };

  for (const m of manifest.maps ?? []) {
    if (!m || typeof m.id !== 'string') continue;
    const image = toBlob(m.image);
    const thumbnail = toBlob(m.thumbnail);
    if (!image || !thumbnail) continue;
    const record: MapRecord = { ...m, image, fog: toBlob(m.fog), thumbnail };
    await putMap(record);
    summary.maps++;
  }

  for (const c of manifest.characters ?? []) {
    if (!c || typeof c.id !== 'string') continue;
    const record: Character = { ...c, portrait: toBlob(c.portrait) };
    await putCharacter(record);
    summary.characters++;
  }

  for (const se of manifest.savedEncounters ?? []) {
    if (!se || typeof se.id !== 'string') continue;
    await saveSavedEncounter(se);
    summary.savedEncounters++;
  }

  if (manifest.encounter && typeof manifest.encounter.id === 'string') {
    await saveEncounter(manifest.encounter);
    summary.encounterRestored = true;
  }

  return summary;
}
