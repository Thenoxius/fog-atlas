import { useCallback, useEffect, useRef, useState } from 'react';
import { addMap, deleteMap, listMaps, renameMap, type MapRecord } from './db';
import { IconEdit, IconMap, IconTrash, IconUpload } from './icons';

interface LibraryProps {
  onOpenMap: (id: string) => void;
}

const THUMB_WIDTH = 480;

async function buildRecord(file: File): Promise<MapRecord> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, THUMB_WIDTH / bitmap.width);
  const thumbCanvas = document.createElement('canvas');
  thumbCanvas.width = Math.max(1, Math.round(bitmap.width * scale));
  thumbCanvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = thumbCanvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0, thumbCanvas.width, thumbCanvas.height);
  const thumbnail = await new Promise<Blob>((resolve, reject) =>
    thumbCanvas.toBlob((b) => (b ? resolve(b) : reject(new Error('thumbnail failed'))), 'image/jpeg', 0.82)
  );

  const now = Date.now();
  const record: MapRecord = {
    id: crypto.randomUUID(),
    name: file.name.replace(/\.[^.]+$/, ''),
    width: bitmap.width,
    height: bitmap.height,
    createdAt: now,
    updatedAt: now,
    image: file,
    fog: null,
    thumbnail,
  };
  bitmap.close();
  return record;
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
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const thumbUrls = useRef<Map<string, string>>(new Map());

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
        await addMap(await buildRecord(file));
      }
      await refresh();
    } catch (err) {
      console.error(err);
      setUploadError('Something went wrong while importing the map.');
    }
  };

  const startRename = (record: MapRecord) => {
    setRenamingId(record.id);
    setRenameValue(record.name);
  };

  const commitRename = async () => {
    if (renamingId && renameValue.trim()) {
      await renameMap(renamingId, renameValue.trim());
      await refresh();
    }
    setRenamingId(null);
  };

  const handleDelete = async (id: string) => {
    await deleteMap(id);
    thumbUrls.current.delete(id);
    setConfirmDeleteId(null);
    await refresh();
  };

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
        ) : maps.length === 0 ? (
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
            {maps.map((record) => (
              <article key={record.id} className="map-card">
                <button className="map-thumb" onClick={() => onOpenMap(record.id)} title="Open map">
                  <img src={thumbUrl(record)} alt={record.name} />
                  <span className="map-thumb-overlay">Open</span>
                  {record.fog && <span className="fog-badge">fog prepared</span>}
                </button>
                <div className="map-card-body">
                  {renamingId === record.id ? (
                    <input
                      className="rename-input"
                      value={renameValue}
                      autoFocus
                      onChange={(e) => setRenameValue(e.target.value)}
                      onBlur={commitRename}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitRename();
                        if (e.key === 'Escape') setRenamingId(null);
                      }}
                    />
                  ) : (
                    <h3 className="map-name" onDoubleClick={() => startRename(record)}>{record.name}</h3>
                  )}
                  <p className="map-meta">
                    {record.width} × {record.height} px · edited {formatDate(record.updatedAt)}
                  </p>
                  <div className="map-card-actions">
                    {confirmDeleteId === record.id ? (
                      <>
                        <span className="confirm-label">Delete map?</span>
                        <button className="btn btn-danger btn-sm" onClick={() => handleDelete(record.id)}>Delete</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDeleteId(null)}>Cancel</button>
                      </>
                    ) : (
                      <>
                        <button className="btn btn-ghost btn-sm" onClick={() => startRename(record)} title="Rename">
                          <IconEdit size={15} />
                        </button>
                        <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDeleteId(record.id)} title="Delete">
                          <IconTrash size={15} />
                        </button>
                        <button className="btn btn-secondary btn-sm open-btn" onClick={() => onOpenMap(record.id)}>
                          Open
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </main>

      <footer className="library-footer">
        Maps, fog, and thumbnails are stored in your browser's IndexedDB on this machine.
      </footer>
    </div>
  );
}
