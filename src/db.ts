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

/** A private note pinned to a spot on the map — for the DM's eyes only. It
 * has no size/color options and is never included in anything sent to the
 * player screen (see present.ts and PlayerView.tsx, neither of which even
 * reference this type). */
export interface MapNote {
  id: string;
  text: string;
  x: number;
  y: number;
}

/** An active condition on a combatant — DM-only, like HP. */
export interface CombatantEffect {
  name: string;
  /** Remaining rounds. Counts down when the combatant's turn ends (so a
   * 1-round effect is still visible while playing that turn) and the effect
   * clears at 0. Absent = lasts until removed by hand. */
  rounds?: number;
}

/** One combatant in the initiative tracker. HP is tracked for the DM's own
 * reference only — it never leaves the DM screen. isEnemy is the opposite:
 * it's meant for players to see, so it travels in PublicCombatant too. */
export interface Combatant {
  id: string;
  name: string;
  initiative: number;
  hpCurrent?: number;
  hpMax?: number;
  isEnemy?: boolean;
  /** Downed/dead — greyed out and skipped by Next Turn. Table-visible
   * reality (the players saw it drop), so it travels in PublicCombatant. */
  down?: boolean;
  /** Links this combatant to a roster Character. Only the id travels to the
   * player screen — the portrait Blob is read there from the shared
   * 'characters' store, never streamed over the channel. */
  characterId?: string;
  /** DM-only conditions (Poisoned, Prone, …), optionally with a remaining
   * round count. Never sent to players. Encounters saved before durations
   * existed stored plain strings — normalized on load in the tracker. */
  effects?: CombatantEffect[];
}

/** The single active encounter, global to the app (not tied to a map), so
 * combat survives switching maps or reloading the page. */
export interface Encounter {
  id: string;
  round: number;
  currentTurnId: string | null;
  combatants: Combatant[];
  updatedAt: number;
}

export const ACTIVE_ENCOUNTER_ID = 'active';

/** One line of a saved encounter template: who joins when it's loaded.
 * Enemies store their base name and get re-numbered (#1, #2, …) against the
 * live encounter at load time. */
export interface SavedEncounterMember {
  name: string;
  isEnemy: boolean;
  characterId?: string;
  /** HP to prefill when the member has no roster stat block to read it from. */
  hpMax?: number;
}

/** A prepped encounter ("Goblin ambush at the bridge") that can be loaded
 * into the tracker with one click. A template, not a snapshot: initiative,
 * current HP, and effects are not saved. */
export interface SavedEncounter {
  id: string;
  name: string;
  members: SavedEncounterMember[];
  createdAt: number;
  updatedAt: number;
}

/** DM-only stat block for a roster character. Every field is optional, so a
 * character can carry as much or as little detail as the DM cares to fill in.
 * These never leave the DM screen — they are for the tracker's detail card. */
export interface CharacterStats {
  ac?: number;
  hpMax?: number;
  speed?: string;
  str?: number;
  dex?: number;
  con?: number;
  int?: number;
  wis?: number;
  cha?: number;
  /** Freeform multiline notes — attacks, traits, abilities, resistances. */
  notes?: string;
}

/** A reusable roster entry — a player character or an enemy type — that can
 * be added into the initiative tracker instead of typing a name by hand.
 * Global to the app, like the encounter itself (not tied to one campaign). */
export interface Character {
  id: string;
  name: string;
  kind: 'pc' | 'enemy';
  /** Square portrait image; null shows a generic placeholder. */
  portrait: Blob | null;
  /** Optional DM-only stat block (AC, HP, ability scores, notes). */
  stats?: CharacterStats;
  /** PCs only: part of the active party, so the tracker's "Add party"
   * button can seat the whole group with one click. */
  inParty?: boolean;
  createdAt: number;
  updatedAt: number;
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
  /** Private DM-only notes placed on the map. Never sent to the player screen. */
  notes?: MapNote[];
}

const DB_NAME = 'fog-atlas';
const DB_VERSION = 4;
const STORE = 'maps';
const ENCOUNTER_STORE = 'initiative';
const CHARACTER_STORE = 'characters';
const SAVED_ENCOUNTER_STORE = 'savedEncounters';

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
        if (!db.objectStoreNames.contains(ENCOUNTER_STORE)) {
          db.createObjectStore(ENCOUNTER_STORE, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(CHARACTER_STORE)) {
          db.createObjectStore(CHARACTER_STORE, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(SAVED_ENCOUNTER_STORE)) {
          db.createObjectStore(SAVED_ENCOUNTER_STORE, { keyPath: 'id' });
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
  fn: (store: IDBObjectStore) => IDBRequest<T>,
  storeName: string = STORE
): Promise<T> {
  const db = await openDb();
  const tx = db.transaction(storeName, mode);
  const result = await requestToPromise(fn(tx.objectStore(storeName)));
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

/** Insert-or-overwrite, used by backup restore (merge by id). */
export async function putMap(record: MapRecord): Promise<void> {
  await withStore('readwrite', (s) => s.put(record));
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

export async function saveNotes(id: string, notes: MapNote[]): Promise<void> {
  const record = await getMap(id);
  if (!record) throw new Error('Map not found');
  record.notes = notes;
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

export async function getEncounter(): Promise<Encounter | undefined> {
  return withStore(
    'readonly',
    (s) => s.get(ACTIVE_ENCOUNTER_ID) as IDBRequest<Encounter | undefined>,
    ENCOUNTER_STORE
  );
}

export async function saveEncounter(encounter: Encounter): Promise<void> {
  await withStore('readwrite', (s) => s.put(encounter), ENCOUNTER_STORE);
}

export async function listCharacters(): Promise<Character[]> {
  const characters = await withStore(
    'readonly',
    (s) => s.getAll() as IDBRequest<Character[]>,
    CHARACTER_STORE
  );
  return characters.sort((a, b) => a.name.localeCompare(b.name));
}

export async function getCharacter(id: string): Promise<Character | undefined> {
  return withStore(
    'readonly',
    (s) => s.get(id) as IDBRequest<Character | undefined>,
    CHARACTER_STORE
  );
}

export async function addCharacter(character: Character): Promise<void> {
  await withStore('readwrite', (s) => s.add(character), CHARACTER_STORE);
}

/** Insert-or-overwrite, used by backup restore (merge by id). */
export async function putCharacter(character: Character): Promise<void> {
  await withStore('readwrite', (s) => s.put(character), CHARACTER_STORE);
}

export async function updateCharacter(id: string, patch: Partial<Character>): Promise<void> {
  const record = await withStore(
    'readonly',
    (s) => s.get(id) as IDBRequest<Character | undefined>,
    CHARACTER_STORE
  );
  if (!record) throw new Error('Character not found');
  Object.assign(record, patch, { updatedAt: Date.now() });
  await withStore('readwrite', (s) => s.put(record), CHARACTER_STORE);
}

export async function deleteCharacter(id: string): Promise<void> {
  await withStore('readwrite', (s) => s.delete(id), CHARACTER_STORE);
}

export async function listSavedEncounters(): Promise<SavedEncounter[]> {
  const encounters = await withStore(
    'readonly',
    (s) => s.getAll() as IDBRequest<SavedEncounter[]>,
    SAVED_ENCOUNTER_STORE
  );
  return encounters.sort((a, b) => a.name.localeCompare(b.name));
}

export async function saveSavedEncounter(encounter: SavedEncounter): Promise<void> {
  await withStore('readwrite', (s) => s.put(encounter), SAVED_ENCOUNTER_STORE);
}

export async function deleteSavedEncounter(id: string): Promise<void> {
  await withStore('readwrite', (s) => s.delete(id), SAVED_ENCOUNTER_STORE);
}
