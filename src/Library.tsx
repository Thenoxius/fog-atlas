import { useCallback, useEffect, useRef, useState } from 'react';
import { addMap, deleteMap, getSceneMaps, listMaps, renameMap, renameScene, type MapRecord } from './db';
import { buildBackup, restoreBackup } from './backup';
import { buildRecordFromFile } from './mapImport';
import { MapPicker } from './MapPicker';
import { Credits } from './Credits';
import { CharacterLibrary } from './CharacterLibrary';
import {
  IconAward, IconCoffee, IconCollection, IconEdit, IconLayers, IconMap, IconSave, IconTrash, IconUpload, IconUsers,
} from './icons';

const KOFI_URL = 'https://ko-fi.com/thenoxius';
const WELCOME_SEEN_KEY = 'fog-atlas-welcome-seen';

interface LibraryProps {
  onOpenMap: (id: string) => void;
}

// A library entry is either a standalone map or a scene grouping several maps
type LibEntry =
  | { kind: 'map'; map: MapRecord }
  | { kind: 'scene'; sceneId: string; sceneName: string; maps: MapRecord[] };

function groupEntries(maps: MapRecord[]): LibEntry[] {
  const entries: LibEntry[] = [];
  const sceneIndex = new Map<string, number>();
  for (const m of maps) {
    if (m.sceneId) {
      const idx = sceneIndex.get(m.sceneId);
      if (idx === undefined) {
        sceneIndex.set(m.sceneId, entries.length);
        entries.push({ kind: 'scene', sceneId: m.sceneId, sceneName: m.sceneName ?? 'Scene', maps: [m] });
      } else {
        (entries[idx] as Extract<LibEntry, { kind: 'scene' }>).maps.push(m);
      }
    } else {
      entries.push({ kind: 'map', map: m });
    }
  }
  // Order scene members by creation so level 1 comes first
  for (const e of entries) {
    if (e.kind === 'scene') e.maps.sort((a, b) => a.createdAt - b.createdAt);
  }
  return entries;
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function Library({ onOpenMap }: LibraryProps) {
  const [maps, setMaps] = useState<MapRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [dragOver, setDragOver] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [renaming, setRenaming] = useState<{ kind: 'map' | 'scene'; id: string } | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<{ kind: 'map' | 'scene'; id: string } | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [creditsOpen, setCreditsOpen] = useState(false);
  const [charactersOpen, setCharactersOpen] = useState(false);
  const [welcomeOpen, setWelcomeOpen] = useState(() => !localStorage.getItem(WELCOME_SEEN_KEY));
  const [backupBusy, setBackupBusy] = useState<'export' | 'restore' | null>(null);
  const [backupStatus, setBackupStatus] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const restoreInputRef = useRef<HTMLInputElement>(null);
  const thumbUrls = useRef<Map<string, string>>(new Map());

  const dismissWelcome = () => {
    localStorage.setItem(WELCOME_SEEN_KEY, '1');
    setWelcomeOpen(false);
  };

  // Everything lives in this browser's storage, so a downloadable archive is
  // the backup story — and the way to move a library to another device.
  const handleBackup = async () => {
    setBackupBusy('export');
    setBackupStatus('');
    try {
      const blob = await buildBackup();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `fog-atlas-backup-${new Date().toISOString().slice(0, 10)}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      setBackupStatus('Backup downloaded.');
    } catch (err) {
      console.error(err);
      setBackupStatus('Backup failed — see the browser console.');
    }
    setBackupBusy(null);
  };

  const handleRestoreFile = async (file: File) => {
    setBackupBusy('restore');
    setBackupStatus('');
    try {
      const summary = await restoreBackup(file);
      setBackupStatus(
        `Restored ${summary.maps} map${summary.maps === 1 ? '' : 's'}, ` +
          `${summary.characters} character${summary.characters === 1 ? '' : 's'}, ` +
          `${summary.savedEncounters} saved encounter${summary.savedEncounters === 1 ? '' : 's'}.`
      );
      await refresh();
    } catch (err) {
      console.error(err);
      setBackupStatus(err instanceof Error ? err.message : 'Restore failed — see the browser console.');
    }
    setBackupBusy(null);
  };

  const refresh = useCallback(async () => {
    const records = await listMaps();
    setMaps(records);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    const urls = thumbUrls.current;
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
      urls.clear();
    };
  }, [refresh]);

  const thumbUrl = (record: MapRecord): string => {
    let url = thumbUrls.current.get(record.id);
    if (!url) {
      url = URL.createObjectURL(record.thumbnail);
      thumbUrls.current.set(record.id, url);
    }
    return url;
  };

  const handleFiles = async (files: FileList | File[]) => {
    setUploadError('');
    const images = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (images.length === 0) {
      setUploadError('Only image files (PNG, JPG, WebP, ...) can be used as maps.');
      return;
    }
    try {
      for (const file of images) {
        await addMap(await buildRecordFromFile(file));
      }
      await refresh();
    } catch (err) {
      console.error(err);
      setUploadError('Something went wrong while importing the map.');
    }
  };

  const startRename = (kind: 'map' | 'scene', id: string, current: string) => {
    setRenaming({ kind, id });
    setRenameValue(current);
  };

  const commitRename = async () => {
    if (renaming && renameValue.trim()) {
      if (renaming.kind === 'map') await renameMap(renaming.id, renameValue.trim());
      else await renameScene(renaming.id, renameValue.trim());
      await refresh();
    }
    setRenaming(null);
  };

  const handleDeleteMap = async (id: string) => {
    await deleteMap(id);
    thumbUrls.current.delete(id);
    setConfirmDelete(null);
    await refresh();
  };

  const handleDeleteScene = async (sceneId: string) => {
    const members = await getSceneMaps(sceneId);
    for (const m of members) {
      await deleteMap(m.id);
      thumbUrls.current.delete(m.id);
    }
    setConfirmDelete(null);
    await refresh();
  };

  const entries = groupEntries(maps);

  const renameInput = (
    <input
      className="rename-input"
      value={renameValue}
      autoFocus
      onChange={(e) => setRenameValue(e.target.value)}
      onBlur={commitRename}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commitRename();
        if (e.key === 'Escape') setRenaming(null);
      }}
    />
  );

  return (
    <div className="library">
      <header className="library-header">
        <div className="brand">
          <span className="brand-icon"><IconMap size={26} /></span>
          <div>
            <h1>Fog Atlas</h1>
            <p className="brand-sub">Campaign map manager for dungeon masters</p>
          </div>
        </div>
        <div className="header-actions">
          <span className="local-badge" title="Maps and fog are stored in this browser via IndexedDB. Nothing is uploaded anywhere.">
            ● 100% local — nothing leaves this device
          </span>
          <button className="btn btn-secondary" onClick={() => setPickerOpen(true)} title="Browse the maps that ship with Fog Atlas">
            <IconCollection />
            Map collection
          </button>
          <button className="btn btn-secondary" onClick={() => setCharactersOpen(true)} title="Manage your roster of player characters and enemies">
            <IconUsers />
            Characters
          </button>
          <button className="btn btn-primary" onClick={() => fileInputRef.current?.click()}>
            <IconUpload />
            Import map
          </button>
        </div>
      </header>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files) handleFiles(e.target.files);
          e.target.value = '';
        }}
      />

      <main
        className={`library-body ${dragOver ? 'drag-over' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          handleFiles(e.dataTransfer.files);
        }}
      >
        {uploadError && <div className="upload-error">{uploadError}</div>}

        {loading ? (
          <div className="empty-state">Loading maps…</div>
        ) : entries.length === 0 ? (
          <div className="empty-state">
            <IconMap size={44} />
            <h2>No maps yet</h2>
            <p>Import battle maps or region maps of your campaign, prepare their fog of war, and take them to the table.</p>
            <button className="btn btn-primary" onClick={() => fileInputRef.current?.click()}>
              <IconUpload />
              Import your first map
            </button>
            <p className="hint">…or drop image files anywhere on this page</p>
          </div>
        ) : (
          <div className="map-grid">
            {entries.map((entry) =>
              entry.kind === 'scene' ? (
                <article key={entry.sceneId} className="map-card scene-card">
                  <button className="map-thumb" onClick={() => onOpenMap(entry.maps[0].id)} title="Open scene">
                    <img src={thumbUrl(entry.maps[0])} alt={entry.sceneName} />
                    <span className="map-thumb-overlay">Open</span>
                    <span className="scene-badge"><IconLayers size={13} /> {entry.maps.length} maps</span>
                    {entry.maps.some((m) => m.fog) && <span className="fog-badge">fog prepared</span>}
                  </button>
                  <div className="map-card-body">
                    {renaming?.kind === 'scene' && renaming.id === entry.sceneId ? (
                      renameInput
                    ) : (
                      <h3 className="map-name" onDoubleClick={() => startRename('scene', entry.sceneId, entry.sceneName)}>
                        {entry.sceneName}
                      </h3>
                    )}
                    <p className="map-meta">
                      Scene · {entry.maps.length} maps · edited{' '}
                      {formatDate(Math.max(...entry.maps.map((m) => m.updatedAt)))}
                    </p>
                    <div className="map-card-actions">
                      {confirmDelete?.kind === 'scene' && confirmDelete.id === entry.sceneId ? (
                        <>
                          <span className="confirm-label">Delete all {entry.maps.length} maps?</span>
                          <button className="btn btn-danger btn-sm" onClick={() => handleDeleteScene(entry.sceneId)}>Delete</button>
                          <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDelete(null)}>Cancel</button>
                        </>
                      ) : (
                        <>
                          <button className="btn btn-ghost btn-sm" onClick={() => startRename('scene', entry.sceneId, entry.sceneName)} title="Rename scene">
                            <IconEdit size={15} />
                          </button>
                          <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDelete({ kind: 'scene', id: entry.sceneId })} title="Delete scene">
                            <IconTrash size={15} />
                          </button>
                          <button className="btn btn-secondary btn-sm open-btn" onClick={() => onOpenMap(entry.maps[0].id)}>
                            Open
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </article>
              ) : (
                <article key={entry.map.id} className="map-card">
                  <button className="map-thumb" onClick={() => onOpenMap(entry.map.id)} title="Open map">
                    <img src={thumbUrl(entry.map)} alt={entry.map.name} />
                    <span className="map-thumb-overlay">Open</span>
                    {entry.map.fog && <span className="fog-badge">fog prepared</span>}
                  </button>
                  <div className="map-card-body">
                    {renaming?.kind === 'map' && renaming.id === entry.map.id ? (
                      renameInput
                    ) : (
                      <h3 className="map-name" onDoubleClick={() => startRename('map', entry.map.id, entry.map.name)}>
                        {entry.map.name}
                      </h3>
                    )}
                    <p className="map-meta">
                      {entry.map.width} × {entry.map.height} px · edited {formatDate(entry.map.updatedAt)}
                    </p>
                    <div className="map-card-actions">
                      {confirmDelete?.kind === 'map' && confirmDelete.id === entry.map.id ? (
                        <>
                          <span className="confirm-label">Delete map?</span>
                          <button className="btn btn-danger btn-sm" onClick={() => handleDeleteMap(entry.map.id)}>Delete</button>
                          <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDelete(null)}>Cancel</button>
                        </>
                      ) : (
                        <>
                          <button className="btn btn-ghost btn-sm" onClick={() => startRename('map', entry.map.id, entry.map.name)} title="Rename">
                            <IconEdit size={15} />
                          </button>
                          <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDelete({ kind: 'map', id: entry.map.id })} title="Delete">
                            <IconTrash size={15} />
                          </button>
                          <button className="btn btn-secondary btn-sm open-btn" onClick={() => onOpenMap(entry.map.id)}>
                            Open
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </article>
              )
            )}
          </div>
        )}
      </main>

      <footer className="library-footer">
        <span>
          Maps, fog, and thumbnails are stored in your browser's IndexedDB on this machine.
          {backupStatus && <span className="backup-status"> {backupStatus}</span>}
        </span>
        <span className="footer-links">
          <button
            className="kofi-link footer-link-btn"
            onClick={handleBackup}
            disabled={backupBusy !== null}
            title="Download your whole library (maps, fog, characters, encounters) as a zip"
          >
            <IconSave size={13} />
            {backupBusy === 'export' ? 'Backing up…' : 'Backup'}
          </button>
          <button
            className="kofi-link footer-link-btn"
            onClick={() => restoreInputRef.current?.click()}
            disabled={backupBusy !== null}
            title="Restore a backup zip — merges into this library, overwriting same ids, never deleting"
          >
            <IconUpload size={13} />
            {backupBusy === 'restore' ? 'Restoring…' : 'Restore'}
          </button>
          <input
            ref={restoreInputRef}
            type="file"
            accept=".zip,application/zip"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleRestoreFile(file);
              e.target.value = '';
            }}
          />
          <button className="kofi-link footer-link-btn" onClick={() => setCreditsOpen(true)} title="See who made the built-in maps">
            <IconAward size={13} />
            Map credits
          </button>
          <a className="kofi-link" href={KOFI_URL} target="_blank" rel="noreferrer" title="Buy me a coffee on Ko-fi">
            <IconCoffee size={13} />
            Support Fog Atlas
          </a>
        </span>
      </footer>

      {welcomeOpen && (
        <div className="collection-overlay" onClick={dismissWelcome}>
          <div className="welcome-panel" onClick={(e) => e.stopPropagation()}>
            <span className="brand-icon welcome-icon"><IconMap size={26} /></span>
            <h2>Welcome to Fog Atlas</h2>
            <p>
              A fog-of-war tool for dungeon masters. Import your own battle maps or pick one
              from the built-in collection, paint fog over what the party hasn't explored,
              and reveal it live at the table. Add a hex or square grid overlay, sized and
              aligned to your map.
            </p>
            <p>
              Run a second screen for your players, group several maps into one scene, and
              everything is saved automatically on this device — no accounts, no cloud.
            </p>
            <button className="btn btn-primary welcome-cta" onClick={dismissWelcome}>
              Start preparing
            </button>
            <p className="welcome-support">
              Fog Atlas is free. If it earns a place at your table,{' '}
              <a href={KOFI_URL} target="_blank" rel="noreferrer">a coffee on Ko-fi</a> is
              always appreciated. ☕
            </p>
          </div>
        </div>
      )}

      {creditsOpen && <Credits onClose={() => setCreditsOpen(false)} />}

      {charactersOpen && <CharacterLibrary onClose={() => setCharactersOpen(false)} />}

      {pickerOpen && (
        <MapPicker
          title="Map Collection"
          subtitle="Battle maps included with Fog Atlas — add one to your library to prepare its fog"
          pickedLabel="In library"
          onClose={() => setPickerOpen(false)}
          onPick={async (record) => {
            await addMap(record);
            await refresh();
          }}
        />
      )}
    </div>
  );
}
