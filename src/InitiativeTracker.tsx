import { useEffect, useRef, useState } from 'react';
import { getEncounter, saveEncounter, ACTIVE_ENCOUNTER_ID, type Combatant, type Encounter } from './db';
import type { PublicInitiativeState } from './present';
import { IconClose, IconInitiative, IconTrash } from './icons';

const SAVE_DEBOUNCE = 500;

interface InitiativeTrackerProps {
  onClose: () => void;
  /** Called with the public (HP-free) view whenever the encounter changes,
   * so the DM screen can relay it to the player screen if presenting. */
  onBroadcast: (state: PublicInitiativeState) => void;
}

const EMPTY_ENCOUNTER: Encounter = {
  id: ACTIVE_ENCOUNTER_ID,
  round: 0,
  currentTurnId: null,
  combatants: [],
  updatedAt: 0,
};

function sortByInitiative(combatants: Combatant[]): Combatant[] {
  return [...combatants].sort((a, b) => b.initiative - a.initiative);
}

function toPublic(encounter: Encounter): PublicInitiativeState {
  return {
    round: encounter.round,
    currentTurnId: encounter.currentTurnId,
    order: sortByInitiative(encounter.combatants).map((c) => ({ id: c.id, name: c.name, isEnemy: !!c.isEnemy })),
  };
}

export function InitiativeTracker({ onClose, onBroadcast }: InitiativeTrackerProps) {
  const [encounter, setEncounter] = useState<Encounter | null>(null);
  const [newName, setNewName] = useState('');
  const [newInitiative, setNewInitiative] = useState('');
  const [confirmingReset, setConfirmingReset] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const initInputRef = useRef<HTMLInputElement>(null);

  // Debounce the IndexedDB write (so typing a name doesn't hit the DB on
  // every keystroke) while keeping local state + the player broadcast
  // immediate. pendingRef lets beforeunload/unmount flush a save that's
  // still sitting in that debounce window instead of losing it.
  const pendingRef = useRef<Encounter | null>(null);
  const saveTimerRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    getEncounter()
      .then((loaded) => {
        if (cancelled) return;
        const e = loaded ?? EMPTY_ENCOUNTER;
        setEncounter(e);
        onBroadcast(toPublic(e));
      })
      .catch(console.error);
    return () => {
      cancelled = true;
    };
    // Only load once on mount; onBroadcast is stable enough for this purpose
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const flush = () => {
      if (pendingRef.current) {
        window.clearTimeout(saveTimerRef.current);
        saveEncounter(pendingRef.current).catch(console.error);
        pendingRef.current = null;
      }
    };
    window.addEventListener('beforeunload', flush);
    return () => {
      flush();
      window.removeEventListener('beforeunload', flush);
    };
  }, []);

  if (!encounter) return null;

  const commit = (next: Encounter) => {
    const withTimestamp = { ...next, updatedAt: Date.now() };
    setEncounter(withTimestamp);
    onBroadcast(toPublic(withTimestamp));
    pendingRef.current = withTimestamp;
    window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      pendingRef.current = null;
      saveEncounter(withTimestamp).catch(console.error);
    }, SAVE_DEBOUNCE);
  };

  const sorted = sortByInitiative(encounter.combatants);

  const handleAdd = () => {
    const name = newName.trim();
    if (!name || newInitiative.trim() === '') return;
    const initiative = Number(newInitiative);
    if (Number.isNaN(initiative)) return;
    const combatant: Combatant = { id: crypto.randomUUID(), name, initiative };
    commit({ ...encounter, combatants: [...encounter.combatants, combatant] });
    setNewName('');
    setNewInitiative('');
    nameInputRef.current?.focus();
  };

  const handleNextTurn = () => {
    if (sorted.length === 0) return;
    if (!encounter.currentTurnId) {
      commit({ ...encounter, currentTurnId: sorted[0].id, round: Math.max(1, encounter.round) });
      return;
    }
    const idx = sorted.findIndex((c) => c.id === encounter.currentTurnId);
    const nextIdx = idx === -1 ? 0 : (idx + 1) % sorted.length;
    const wrapped = idx !== -1 && nextIdx === 0;
    commit({
      ...encounter,
      currentTurnId: sorted[nextIdx].id,
      round: wrapped ? encounter.round + 1 : Math.max(1, encounter.round),
    });
  };

  const handleReset = () => {
    commit({ ...encounter, round: 0, currentTurnId: null, combatants: [] });
    setConfirmingReset(false);
  };

  return (
    <div className="initiative-panel">
      <header className="initiative-header">
        <h3>
          <IconInitiative size={16} />
          Initiative
          {encounter.round > 0 && <span className="initiative-round">Round {encounter.round}</span>}
        </h3>
        <button className="btn btn-ghost btn-sm" onClick={onClose} title="Close">
          <IconClose size={14} />
        </button>
      </header>

      <div className="initiative-list">
        {sorted.length === 0 ? (
          <p className="initiative-empty">Add combatants below to start tracking turns.</p>
        ) : (
          sorted.map((c) => (
            <div
              key={c.id}
              className={`initiative-row ${c.id === encounter.currentTurnId ? 'initiative-row-active' : ''} ${c.isEnemy ? 'initiative-row-enemy' : ''}`}
            >
              <input
                type="checkbox"
                className="initiative-enemy-checkbox"
                checked={!!c.isEnemy}
                title="Enemy — shown to players so they can spot enemy turns"
                onChange={(e) =>
                  commit({
                    ...encounter,
                    combatants: encounter.combatants.map((x) => (x.id === c.id ? { ...x, isEnemy: e.target.checked } : x)),
                  })
                }
              />
              <input
                className="initiative-name-input"
                value={c.name}
                onChange={(e) =>
                  commit({
                    ...encounter,
                    combatants: encounter.combatants.map((x) => (x.id === c.id ? { ...x, name: e.target.value } : x)),
                  })
                }
              />
              <input
                type="number"
                className="initiative-init-input"
                value={c.initiative}
                title="Initiative"
                onChange={(e) =>
                  commit({
                    ...encounter,
                    combatants: encounter.combatants.map((x) =>
                      x.id === c.id ? { ...x, initiative: Number(e.target.value) || 0 } : x
                    ),
                  })
                }
              />
              <div className="initiative-hp" title="HP (DM only — never shown to players)">
                <input
                  type="number"
                  className="initiative-hp-input"
                  placeholder="HP"
                  value={c.hpCurrent ?? ''}
                  onChange={(e) =>
                    commit({
                      ...encounter,
                      combatants: encounter.combatants.map((x) =>
                        x.id === c.id
                          ? { ...x, hpCurrent: e.target.value === '' ? undefined : Number(e.target.value) }
                          : x
                      ),
                    })
                  }
                />
                <span className="initiative-hp-sep">/</span>
                <input
                  type="number"
                  className="initiative-hp-input"
                  placeholder="max"
                  value={c.hpMax ?? ''}
                  onChange={(e) =>
                    commit({
                      ...encounter,
                      combatants: encounter.combatants.map((x) =>
                        x.id === c.id ? { ...x, hpMax: e.target.value === '' ? undefined : Number(e.target.value) } : x
                      ),
                    })
                  }
                />
              </div>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => commit({ ...encounter, combatants: encounter.combatants.filter((x) => x.id !== c.id) })}
                title="Remove"
              >
                <IconTrash size={14} />
              </button>
            </div>
          ))
        )}
      </div>

      <div className="initiative-add-row">
        <input
          ref={nameInputRef}
          className="initiative-name-input"
          placeholder="Name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            // Enter here moves to Initiative rather than submitting, since
            // pressing Enter with Initiative still empty used to silently
            // add a combatant with initiative 0 instead of doing nothing.
            if (newName.trim()) initInputRef.current?.focus();
          }}
        />
        <input
          ref={initInputRef}
          type="number"
          className="initiative-init-input"
          placeholder="Init"
          value={newInitiative}
          onChange={(e) => setNewInitiative(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            handleAdd();
          }}
        />
        <button className="btn btn-secondary btn-sm" onClick={handleAdd} disabled={!newName.trim() || newInitiative === ''}>
          Add
        </button>
      </div>

      <div className="initiative-controls">
        <button className="btn btn-primary btn-sm" onClick={handleNextTurn} disabled={sorted.length === 0}>
          Next Turn
        </button>
        {confirmingReset ? (
          <>
            <span className="confirm-label">Clear encounter?</span>
            <button className="btn btn-danger btn-sm" onClick={handleReset}>Yes</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setConfirmingReset(false)}>Cancel</button>
          </>
        ) : (
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setConfirmingReset(true)}
            disabled={sorted.length === 0 && encounter.round === 0}
          >
            Reset
          </button>
        )}
      </div>
    </div>
  );
}
