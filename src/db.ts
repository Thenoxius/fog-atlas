// Local persistence layer. Everything lives in the browser's IndexedDB:
// map images, fog masks, and thumbnails are stored as blobs on this
// device only — nothing ever leaves the machine.

export type GridType = 'none' | 'hex' | 'square';

/** A text annotation placed on a map, positioned in map coordinates. */
export interface MapLabel {
  id: string;
  text: string;
  /** Center of the label, in map pixels. */
  x: number;
  y: number;
  /** Font size in map pixels (scales with the map). */
  fontSize: number;
  fontFamily: string;
  color: string;
}

/** An icon marker placed on a map, positioned in map coordinates. */
export interface MapToken {
  id: string;
  /** Emoji glyph rendered on the badge. */
  icon: string;
  /** Center of the token, in map pixels. */
  x: number;
  y: number;
  /** Badge diameter in map pixels (scales with the map). */
  size: number;
  /** Background badge color. */
  color: string;
}

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
  /** When set, this map is one level of a multi-map scene; siblings share the id. */
  sceneId?: string;
  /** Display name of the scene the map belongs to. */
  sceneName?: string;
  /** Text annotations placed on the map. */
  labels?: MapLabel[];
  /** Icon markers placed on the map. */
  tokens?: MapToken[];
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

/** All maps belonging to a scene, in creation order (stable level ordering). */
export async function getSceneMaps(sceneId: string): Promise<MapRecord[]> {
  const maps = await withStore('readonly', (s) => s.getAll() as IDBRequest<MapRecord[]>);
  return maps.filter((m) => m.sceneId === sceneId).sort((a, b) => a.createdAt - b.createdAt);
}

export async function setMapScene(id: string, sceneId: string | undefined, sceneName: string | undefined): Promise<void> {
  const record = await getMap(id);
  if (!record) throw new Error('Map not found');
  record.sceneId = sceneId;
  record.sceneName = sceneName;
  record.updatedAt = Date.now();
  await withStore('readwrite', (s) => s.put(record));
}

/** Rename a scene across all of its member maps. */
export async function renameScene(sceneId: string, sceneName: string): Promise<void> {
  const members = await getSceneMaps(sceneId);
  for (const record of members) {
    record.sceneName = sceneName;
    record.updatedAt = Date.now();
    await withStore('readwrite', (s) => s.put(record));
  }
}

export async function saveLabels(id: string, labels: MapLabel[]): Promise<void> {
  const record = await getMap(id);
  if (!record) throw new Error('Map not found');
  record.labels = labels;
  record.updatedAt = Date.now();
  await withStore('readwrite', (s) => s.put(record));
}

export async function saveTokens(id: string, tokens: MapToken[]): Promise<void> {
  const record = await getMap(id);
  if (!record) throw new Error('Map not found');
  record.tokens = tokens;
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
