import { useEffect, useRef, useState } from 'react';
import { addCharacter, deleteCharacter, listCharacters, updateCharacter, type Character, type CharacterStats } from './db';
import { buildPortraitBlob } from './characterImport';
import { IconChevron, IconClose, IconPortrait, IconShield, IconTrash, IconUpload, IconUsers } from './icons';

// Ability scores rendered as the six compact inputs in the details editor.
type AbilityKey = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
const ABILITIES: [AbilityKey, string][] = [
  ['str', 'STR'],
  ['dex', 'DEX'],
  ['con', 'CON'],
  ['int', 'INT'],
  ['wis', 'WIS'],
  ['cha', 'CHA'],
];

interface CharacterLibraryProps {
  onClose: () => void;
}

// Roster of reusable characters (player characters + enemy types) that can
// be added into the Initiative Tracker with a portrait instead of typing a
// name by hand each time. Global to the app, like the encounter itself.
export function CharacterLibrary({ onClose }: CharacterLibraryProps) {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [newName, setNewName] = useState('');
  const [newKind, setNewKind] = useState<'pc' | 'enemy'>('pc');
  const [newPortraitFile, setNewPortraitFile] = useState<File | null>(null);
  const [newPortraitPreview, setNewPortraitPreview] = useState<string | null>(null);
  const newPortraitPreviewRef = useRef<string | null>(null);
  newPortraitPreviewRef.current = newPortraitPreview;

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [detailsId, setDetailsId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const editFileInputRef = useRef<HTMLInputElement>(null);
  const editingPortraitId = useRef<string | null>(null);
  const portraitUrls = useRef<Map<string, string>>(new Map());

  const refresh = async () => {
    setCharacters(await listCharacters());
    setLoading(false);
  };

  useEffect(() => {
    refresh();
    const urls = portraitUrls.current;
    return () => {
      urls.forEach((u) => URL.revokeObjectURL(u));
      urls.clear();
      if (newPortraitPreviewRef.current) URL.revokeObjectURL(newPortraitPreviewRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const portraitUrl = (c: Character): string | null => {
    if (!c.portrait) return null;
    let url = portraitUrls.current.get(c.id);
    if (!url) {
      url = URL.createObjectURL(c.portrait);
      portraitUrls.current.set(c.id, url);
    }
    return url;
  };

  const handleNewPortraitFile = (file: File) => {
    if (newPortraitPreview) URL.revokeObjectURL(newPortraitPreview);
    setNewPortraitFile(file);
    setNewPortraitPreview(URL.createObjectURL(file));
  };

  const handleAdd = async () => {
    const name = newName.trim();
    if (!name) return;
    setError('');
    try {
      const portrait = newPortraitFile ? await buildPortraitBlob(newPortraitFile) : null;
      const now = Date.now();
      await addCharacter({ id: crypto.randomUUID(), name, kind: newKind, portrait, createdAt: now, updatedAt: now });
      setNewName('');
      if (newPortraitPreview) URL.revokeObjectURL(newPortraitPreview);
      setNewPortraitFile(null);
      setNewPortraitPreview(null);
      await refresh();
    } catch (err) {
      console.error(err);
      setError('Something went wrong while adding the character.');
    }
  };

  const handleReplacePortrait = async (id: string, file: File) => {
    setError('');
    try {
      const portrait = await buildPortraitBlob(file);
      await updateCharacter(id, { portrait });
      portraitUrls.current.delete(id);
      await refresh();
    } catch (err) {
      console.error(err);
      setError('Something went wrong while updating the portrait.');
    }
  };

  const startRename = (c: Character) => {
    setRenamingId(c.id);
    setRenameValue(c.name);
  };

  const commitRename = async () => {
    if (renamingId && renameValue.trim()) {
      await updateCharacter(renamingId, { name: renameValue.trim() });
      await refresh();
    }
    setRenamingId(null);
  };

  const handleDelete = async (id: string) => {
    await deleteCharacter(id);
    portraitUrls.current.delete(id);
    setConfirmDeleteId(null);
    if (detailsId === id) setDetailsId(null);
    await refresh();
  };

  // Persist a stat-block edit. Updates local state immediately (so the input
  // stays responsive) and writes through to IndexedDB; we avoid refresh() here
  // so a keystroke doesn't trigger a re-sort/reload that would drop focus.
  const updateStats = (c: Character, patch: Partial<CharacterStats>) => {
    const nextStats: CharacterStats = { ...(c.stats ?? {}), ...patch };
    setCharacters((prev) => prev.map((x) => (x.id === c.id ? { ...x, stats: nextStats } : x)));
    updateCharacter(c.id, { stats: nextStats }).catch((err) => {
      console.error(err);
      setError('Something went wrong while saving stats.');
    });
  };

  // Numeric fields store `undefined` when blank, otherwise a finite number.
  const numFromInput = (value: string): number | undefined => {
    if (value.trim() === '') return undefined;
    const n = Number(value);
    return Number.isNaN(n) ? undefined : n;
  };

  const pcs = characters.filter((c) => c.kind === 'pc');
  const enemies = characters.filter((c) => c.kind === 'enemy');

  const renderCard = (c: Character) => {
    const url = portraitUrl(c);
    const detailsOpen = detailsId === c.id;
    return (
      <article key={c.id} className={`character-card ${detailsOpen ? 'character-card-open' : ''}`}>
        <div className="character-card-top">
          <button
            className="character-portrait"
            onClick={() => {
              editingPortraitId.current = c.id;
              editFileInputRef.current?.click();
            }}
            title="Click to change portrait"
          >
            {url ? <img src={url} alt={c.name} /> : <IconPortrait size={26} />}
          </button>
          <div className="character-card-body">
            {renamingId === c.id ? (
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
              <h3 className="character-name" onDoubleClick={() => startRename(c)} title={c.name}>
                {c.name}
              </h3>
            )}
          </div>
        </div>
        {confirmDeleteId === c.id ? (
          <div className="character-confirm">
            <span className="confirm-label">Delete?</span>
            <button className="btn btn-danger btn-sm" onClick={() => handleDelete(c.id)}>Yes</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDeleteId(null)}>Cancel</button>
          </div>
        ) : (
          <div className="character-card-actions">
            {c.kind === 'pc' && (
              <button
                className={`btn btn-ghost btn-sm character-party-toggle ${c.inParty ? 'character-party-toggle-active' : ''}`}
                onClick={async () => {
                  await updateCharacter(c.id, { inParty: !c.inParty });
                  await refresh();
                }}
                title={
                  c.inParty
                    ? 'In the party — click to remove'
                    : 'Add to the party — the initiative tracker seats the whole party with one click'
                }
                aria-pressed={!!c.inParty}
              >
                <IconShield size={13} />
                Party
              </button>
            )}
            <button
              className={`btn btn-ghost btn-sm character-details-toggle ${detailsOpen ? 'character-details-toggle-open' : ''}`}
              onClick={() => setDetailsId(detailsOpen ? null : c.id)}
              title={detailsOpen ? 'Hide details' : 'Edit stats & details'}
              aria-expanded={detailsOpen}
            >
              Details
              <IconChevron size={13} />
            </button>
            <button className="btn btn-ghost btn-sm character-delete" onClick={() => setConfirmDeleteId(c.id)} title="Delete">
              <IconTrash size={13} />
            </button>
          </div>
        )}
        {detailsOpen && (
          <div className="character-details">
            <div className="character-details-row">
              <label className="character-field">
                <span>AC</span>
                <input
                  type="number"
                  value={c.stats?.ac ?? ''}
                  onChange={(e) => updateStats(c, { ac: numFromInput(e.target.value) })}
                />
              </label>
              <label className="character-field">
                <span>HP</span>
                <input
                  type="number"
                  value={c.stats?.hpMax ?? ''}
                  onChange={(e) => updateStats(c, { hpMax: numFromInput(e.target.value) })}
                />
              </label>
              <label className="character-field character-field-speed">
                <span>Speed</span>
                <input
                  type="text"
                  value={c.stats?.speed ?? ''}
                  placeholder="30 ft."
                  onChange={(e) => updateStats(c, { speed: e.target.value || undefined })}
                />
              </label>
            </div>
            <div className="character-abilities">
              {ABILITIES.map(([key, label]) => (
                <label key={key} className="character-ability-field">
                  <span>{label}</span>
                  <input
                    type="number"
                    value={c.stats?.[key] ?? ''}
                    onChange={(e) => updateStats(c, { [key]: numFromInput(e.target.value) })}
                  />
                </label>
              ))}
            </div>
            <textarea
              className="character-notes"
              placeholder="Attacks, traits, abilities, resistances…"
              value={c.stats?.notes ?? ''}
              onChange={(e) => updateStats(c, { notes: e.target.value || undefined })}
            />
          </div>
        )}
      </article>
    );
  };

  return (
    <div className="collection-overlay" onClick={onClose}>
      <div className="collection-panel character-panel" onClick={(e) => e.stopPropagation()}>
        <header className="collection-header">
          <div>
            <h2><IconUsers size={20} /> Characters</h2>
            <p className="collection-sub">
              A reusable roster — add these into the Initiative Tracker instead of typing names by hand
            </p>
          </div>
          <button className="btn btn-ghost" onClick={onClose} title="Close">
            <IconClose />
          </button>
        </header>

        <div className="character-add-row">
          <button
            className="character-portrait character-portrait-new"
            onClick={() => fileInputRef.current?.click()}
            title="Add a portrait"
          >
            {newPortraitPreview ? <img src={newPortraitPreview} alt="" /> : <IconUpload size={16} />}
          </button>
          <input
            className="character-name-input"
            placeholder="Name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          />
          <div className="character-kind-toggle" role="group" aria-label="Character type">
            <button className={`btn btn-sm ${newKind === 'pc' ? 'btn-secondary' : 'btn-ghost'}`} onClick={() => setNewKind('pc')}>
              PC
            </button>
            <button className={`btn btn-sm ${newKind === 'enemy' ? 'btn-secondary' : 'btn-ghost'}`} onClick={() => setNewKind('enemy')}>
              Enemy
            </button>
          </div>
          <button className="btn btn-primary btn-sm" onClick={handleAdd} disabled={!newName.trim()}>
            Add
          </button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            if (e.target.files?.[0]) handleNewPortraitFile(e.target.files[0]);
            e.target.value = '';
          }}
        />
        <input
          ref={editFileInputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            const id = editingPortraitId.current;
            if (file && id) handleReplacePortrait(id, file);
            e.target.value = '';
          }}
        />

        {error && <div className="upload-error">{error}</div>}

        <div className="collection-grid-wrap">
          {loading ? (
            <div className="empty-state">Loading…</div>
          ) : characters.length === 0 ? (
            <div className="empty-state">
              <IconUsers size={40} />
              <h2>No characters yet</h2>
              <p>Add player characters and enemy types above — they'll show up in the Initiative Tracker with their portrait.</p>
            </div>
          ) : (
            <>
              <h3 className="character-group-heading">Player Characters</h3>
              {pcs.length === 0 ? (
                <p className="character-group-empty">No player characters yet.</p>
              ) : (
                <div className="character-grid">{pcs.map(renderCard)}</div>
              )}

              <h3 className="character-group-heading">Enemies</h3>
              {enemies.length === 0 ? (
                <p className="character-group-empty">No enemy types yet.</p>
              ) : (
                <div className="character-grid">{enemies.map(renderCard)}</div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
