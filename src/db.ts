// Local persistence layer. Everything lives in the browser's IndexedDB:
// map images, fog masks, and thumbnails are stored as blobs on this
// device only — nothing ever leaves the machine.

export type GridType = 'none' | 'hex' | 'square';

export interface MapRecord {
  id: string;
  name: string;
  width: number;
  height: number;
  createdAt: number;
  updatedAt: number;
  /** Original uploaded map image. */
  image: Blob;
  /** PNG alpha mask of the fog layer; null when the map has no fog yet. */
  fog: Blob | null;
  /** Small JPEG preview for the library grid. */
  thumbnail: Blob;
  /** Grid overlay settings; absent on maps saved before the feature existed. */
  gridType?: GridType;
  /** Cell size in map pixels (hex width / square side). */
  gridSize?: number;
  /** Grid translation in map pixels, to align the overlay with a grid baked into the map art. */
  gridOffsetX?: number;
  gridOffsetY?: number;
  /** Grid line thickness in screen pixels. */
  gridLineWidth?: number;
  /** Grid visibility, 0..1. */
  gridOpacity?: number;
}

const DB_NAME = 'fog-atlas';
const DB_VERSION = 1;
const STORE = 'maps';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function requestToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  const db = await openDb();
  const tx = db.transaction(STORE, mode);
  const result = await requestToPromise(fn(tx.objectStore(STORE)));
  return result;
}

export async function listMaps(): Promise<MapRecord[]> {
  const maps = await withStore('readonly', (s) => s.getAll() as IDBRequest<MapRecord[]>);
  return maps.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getMap(id: string): Promise<MapRecord | undefined> {
  return withStore('readonly', (s) => s.get(id) as IDBRequest<MapRecord | undefined>);
}

export async function addMap(record: MapRecord): Promise<void> {
  await withStore('readwrite', (s) => s.add(record));
}

export async function saveFog(id: string, fog: Blob | null): Promise<void> {
  const record = await getMap(id);
  if (!record) throw new Error('Map not found');
  record.fog = fog;
  record.updatedAt = Date.now();
  await withStore('readwrite', (s) => s.put(record));
}

export interface GridSettings {
  gridType: GridType;
  gridSize: number;
  gridOffsetX: number;
  gridOffsetY: number;
  gridLineWidth: number;
  gridOpacity: number;
}

export async function saveGridSettings(id: string, settings: GridSettings): Promise<void> {
  const record = await getMap(id);
  if (!record) throw new Error('Map not found');
  Object.assign(record, settings);
  record.updatedAt = Date.now();
  await withStore('readwrite', (s) => s.put(record));
}

export async function renameMap(id: string, name: string): Promise<void> {
  const record = await getMap(id);
  if (!record) throw new Error('Map not found');
  record.name = name;
  record.updatedAt = Date.now();
  await withStore('readwrite', (s) => s.put(record));
}

export async function deleteMap(id: string): Promise<void> {
  await withStore('readwrite', (s) => s.delete(id));
}
