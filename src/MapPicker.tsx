import { useEffect, useRef, useState } from 'react';
import type { MapRecord } from './db';
import { collectionUrl, loadCollection, type CollectionMap } from './collection';
import { buildRecordFromBlob, buildRecordFromFile } from './mapImport';
import { IconClose, IconCollection, IconUpload } from './icons';

interface MapPickerProps {
  title: string;
  subtitle: string;
  /** Verb shown while a map is being added, e.g. "In library" or "In scene". */
  pickedLabel: string;
  onClose: () => void;
  /** Persist the built record (caller assigns scene membership, refreshes, etc.). */
  onPick: (record: MapRecord) => Promise<void>;
}

// Modal for adding a map from an uploaded file or the bundled collection.
// It only builds the MapRecord; the caller decides where it lands.
export function MapPicker({ title, subtitle, pickedLabel, onClose, onPick }: MapPickerProps) {
  const [maps, setMaps] = useState<CollectionMap[] | null>(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [folder, setFolder] = useState('all');
  const [addingId, setAddingId] = useState<string | null>(null);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadCollection()
      .then(setMaps)
      .catch((err) => {
        console.error(err);
        setError('The map collection could not be loaded.');
      });
  }, []);

  const handleUpload = async (files: FileList) => {
    const images = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (images.length === 0) return;
    setError('');
    try {
      for (const file of images) {
        await onPick(await buildRecordFromFile(file));
      }
      onClose();
    } catch (err) {
      console.error(err);
      setError('Something went wrong while importing the map.');
    }
  };

  const handleAddFromCollection = async (entry: CollectionMap) => {
    setAddingId(entry.id);
    setError('');
    try {
      const res = await fetch(collectionUrl(entry.file));
      if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
      const record = await buildRecordFromBlob(await res.blob(), entry.name);
      if (entry.pps) record.gridSize = entry.pps;
      await onPick(record);
      setAddedIds((prev) => new Set(prev).add(entry.id));
    } catch (err) {
      console.error(err);
      setError(`Could not add "${entry.name}".`);
    } finally {
      setAddingId(null);
    }
  };

  const folders = maps ? [...new Set(maps.map((m) => m.folder))].sort() : [];
  const visible = (maps ?? []).filter((m) => {
    const matchesFolder = folder === 'all' || m.folder === folder;
    const matchesSearch = m.name.toLowerCase().includes(search.toLowerCase());
    return matchesFolder && matchesSearch;
  });

  return (
    <div className="collection-overlay" onClick={onClose}>
      <div className="collection-panel" onClick={(e) => e.stopPropagation()}>
        <header className="collection-header">
          <div>
            <h2><IconCollection size={20} /> {title}</h2>
            <p className="collection-sub">{maps ? subtitle : 'Loading…'}</p>
          </div>
          <div className="collection-header-actions">
            <button className="btn btn-secondary" onClick={() => fileInputRef.current?.click()}>
              <IconUpload />
              Upload file
            </button>
            <button className="btn btn-ghost" onClick={onClose} title="Close">
              <IconClose />
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
            if (e.target.files) handleUpload(e.target.files);
            e.target.value = '';
          }}
        />

        <div className="collection-controls">
          <input
            className="collection-search"
            placeholder="Search maps…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select className="collection-folder" value={folder} onChange={(e) => setFolder(e.target.value)}>
            <option value="all">All series ({maps?.length ?? 0})</option>
            {folders.map((f) => (
              <option key={f} value={f}>
                {f} ({maps?.filter((m) => m.folder === f).length})
              </option>
            ))}
          </select>
        </div>

        {error && <div className="upload-error">{error}</div>}

        <div className="collection-grid-wrap">
          {maps && visible.length === 0 ? (
            <div className="empty-state">No maps match your search.</div>
          ) : (
            <div className="collection-grid">
              {visible.map((entry) => (
                <article key={entry.id} className="collection-card">
                  <div className="collection-thumb">
                    <img src={collectionUrl(entry.thumb)} alt={entry.name} loading="lazy" />
                  </div>
                  <div className="collection-card-body">
                    <h3 title={entry.name}>{entry.name}</h3>
                    <p className="map-meta">
                      {entry.folder}
                      {entry.gridW && entry.gridH ? ` · ${entry.gridW}×${entry.gridH} squares` : ''}
                    </p>
                    {addedIds.has(entry.id) ? (
                      <span className="collection-added">✓ {pickedLabel}</span>
                    ) : (
                      <button
                        className="btn btn-primary btn-sm"
                        disabled={addingId !== null}
                        onClick={() => handleAddFromCollection(entry)}
                      >
                        {addingId === entry.id ? 'Adding…' : 'Add'}
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
