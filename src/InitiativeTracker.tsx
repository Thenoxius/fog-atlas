import { useEffect, useMemo, useRef, useState } from 'react';
import {
  getEncounter,
  saveEncounter,
  listCharacters,
  listSavedEncounters,
  saveSavedEncounter,
  deleteSavedEncounter,
  ACTIVE_ENCOUNTER_ID,
  type Character,
  type Combatant,
  type CombatantEffect,
  type Encounter,
  type SavedEncounter,
  type SavedEncounterMember,
} from './db';
import type { PublicInitiativeState } from './present';
import {
  IconChevron, IconChevronsLeft, IconChevronsRight, IconClose, IconCollection, IconInitiative, IconPortrait,
  IconShield, IconSkull, IconTrash, IconUsers,
} from './icons';

const SAVE_DEBOUNCE = 500;

// Conditions offered as one-tap buttons in the effects editor. Anything else
// the DM can type by hand in the custom field beside them.
const COMMON_CONDITIONS = [
  'Blinded',
  'Charmed',
  'Frightened',
  'Grappled',
  'Paralyzed',
  'Poisoned',
  'Prone',
  'Restrained',
  'Stunned',
  'Unconscious',
];

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

/** Encounters saved before effect durations existed stored effects as plain
 * strings — lift those into { name } objects on load. */
function normalizeEncounter(e: Encounter): Encounter {
  return {
    ...e,
    combatants: e.combatants.map((c) => ({
      ...c,
      effects: c.effects?.map((x: CombatantEffect | string) => (typeof x === 'string' ? { name: x } : x)),
    })),
  };
}

function toPublic(encounter: Encounter): PublicInitiativeState {
  return {
    round: encounter.round,
    currentTurnId: encounter.currentTurnId,
    // Only id/name/isEnemy/down/characterId travel — never HP, stats, or
    // effects, and never the portrait Blob (the player window reads that
    // from IndexedDB).
    order: sortByInitiative(encounter.combatants).map((c) => ({
      id: c.id,
      name: c.name,
      isEnemy: !!c.isEnemy,
      down: c.down ? true : undefined,
      characterId: c.characterId,
    })),
  };
}

/** Next auto-numbered name for a roster enemy, derived from the current
 * encounter (not a stored counter, so it resets when combat is cleared).
 * Scans combatants matching `base` or `base #N` and returns `base #(max+1)`;
 * the first one when none exist is `base #1`. */
function nextEnemyName(base: string, combatants: Combatant[]): string {
  const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`^${escaped}(?: #(\\d+))?$`);
  let max = 0;
  for (const c of combatants) {
    const m = c.name.match(re);
    if (m) {
      const n = m[1] ? Number(m[1]) : 0;
      if (n > max) max = n;
    }
  }
  return `${base} #${max + 1}`;
}

function abilityMod(score: number): string {
  const mod = Math.floor((score - 10) / 2);
  return mod >= 0 ? `+${mod}` : `${mod}`;
}

// DM display preferences — per device (like the player screen's bar prefs),
// not part of the encounter data.
const PREF_COMPACT = 'fog-atlas-initiative-compact';
const PREF_REFERENCE = 'fog-atlas-initiative-reference';

function loadPref(key: string, fallback: boolean): boolean {
  const v = localStorage.getItem(key);
  return v === null ? fallback : v === '1';
}

function savePref(key: string, value: boolean) {
  localStorage.setItem(key, value ? '1' : '0');
}

/** 0..1 fill for an HP bar, or null when the combatant has no max HP. A
 * blank current field counts as full (freshly added from the roster). */
function hpFraction(c: Combatant): number | null {
  if (c.hpMax == null || c.hpMax <= 0) return null;
  return Math.max(0, Math.min(1, (c.hpCurrent ?? c.hpMax) / c.hpMax));
}

function hpColor(fraction: number): string {
  if (fraction > 0.5) return 'var(--ok)';
  if (fraction > 0.25) return 'var(--reveal)';
  return 'var(--danger)';
}

function HpBar({ combatant, className }: { combatant: Combatant; className?: string }) {
  const f = hpFraction(combatant);
  if (f === null) return null;
  return (
    <span className={`initiative-hpbar ${className ?? ''}`}>
      <span className="initiative-hpbar-fill" style={{ width: `${f * 100}%`, background: hpColor(f) }} />
    </span>
  );
}

/** A character's stat block — shown in a row's expanded detail card and on
 * the pinned enemy reference cards. DM-only, like everything around it. */
function StatBlock({ character }: { character: Character | undefined }) {
  if (!character) {
    return <p className="initiative-detail-hint">No linked roster character.</p>;
  }
  const s = character.stats;
  const hasCore = s && (s.ac != null || s.hpMax != null || (s.speed && s.speed.trim() !== ''));
  const abilities: [string, number | undefined][] = s
    ? [
        ['STR', s.str],
        ['DEX', s.dex],
        ['CON', s.con],
        ['INT', s.int],
        ['WIS', s.wis],
        ['CHA', s.cha],
      ]
    : [];
  const hasAbilities = abilities.some(([, v]) => v != null);
  const hasNotes = s?.notes && s.notes.trim() !== '';
  if (!s || (!hasCore && !hasAbilities && !hasNotes)) {
    return <p className="initiative-detail-hint">No stats yet — add them from the Characters roster.</p>;
  }
  return (
    <div className="initiative-statblock">
      {hasCore && (
        <div className="initiative-stat-core">
          {s.ac != null && (
            <span className="initiative-stat-chip">
              <b>AC</b> {s.ac}
            </span>
          )}
          {s.hpMax != null && (
            <span className="initiative-stat-chip">
              <b>HP</b> {s.hpMax}
            </span>
          )}
          {s.speed && s.speed.trim() !== '' && (
            <span className="initiative-stat-chip">
              <b>Speed</b> {s.speed}
            </span>
          )}
        </div>
      )}
      {hasAbilities && (
        <div className="initiative-abilities">
          {abilities.map(([label, value]) => (
            <div key={label} className="initiative-ability">
              <span className="initiative-ability-label">{label}</span>
              <span className="initiative-ability-score">{value ?? '—'}</span>
              {value != null && <span className="initiative-ability-mod">{abilityMod(value)}</span>}
            </div>
          ))}
        </div>
      )}
      {hasNotes && <p className="initiative-stat-notes">{s.notes}</p>}
    </div>
  );
}

export function InitiativeTracker({ onClose, onBroadcast }: InitiativeTrackerProps) {
  const [encounter, setEncounter] = useState<Encounter | null>(null);
  const [newName, setNewName] = useState('');
  const [newInitiative, setNewInitiative] = useState('');
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [rosterOpen, setRosterOpen] = useState(false);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [customEffect, setCustomEffect] = useState('');
  const [effectRounds, setEffectRounds] = useState('');
  const [encountersOpen, setEncountersOpen] = useState(false);
  const [savedEncounters, setSavedEncounters] = useState<SavedEncounter[]>([]);
  const [saveName, setSaveName] = useState('');
  const [confirmDeleteSavedId, setConfirmDeleteSavedId] = useState<string | null>(null);
  const [compact, setCompact] = useState(() => loadPref(PREF_COMPACT, false));
  const [showReference, setShowReference] = useState(() => loadPref(PREF_REFERENCE, true));
  const nameInputRef = useRef<HTMLInputElement>(null);
  const initInputRef = useRef<HTMLInputElement>(null);

  // Per-row initiative inputs, so adding from the roster can focus the fresh
  // row's roll field. Populated by each row's ref callback.
  const rowInitRefs = useRef<Map<string, HTMLInputElement>>(new Map());
  const pendingFocusRef = useRef<string | null>(null);

  // Object-URL cache for row portrait avatars, keyed by characterId and
  // revoked on unmount (same pattern as CharacterLibrary).
  const portraitUrls = useRef<Map<string, string>>(new Map());

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
        const e = loaded ? normalizeEncounter(loaded) : EMPTY_ENCOUNTER;
        setEncounter(e);
        onBroadcast(toPublic(e));
      })
      .catch(console.error);
    // Load the roster up front so row avatars and stat blocks resolve without
    // waiting for the picker to be opened.
    listCharacters().then(setCharacters).catch(console.error);
    return () => {
      cancelled = true;
    };
    // Only load once on mount; onBroadcast is stable enough for this purpose
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const urls = portraitUrls.current;
    return () => {
      urls.forEach((u) => URL.revokeObjectURL(u));
      urls.clear();
    };
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

  // Focus a freshly added roster row's initiative input after it renders.
  useEffect(() => {
    if (!pendingFocusRef.current) return;
    const el = rowInitRefs.current.get(pendingFocusRef.current);
    if (el) {
      el.focus();
      el.select();
    }
    pendingFocusRef.current = null;
  });

  const characterMap = useMemo(() => new Map(characters.map((c) => [c.id, c])), [characters]);

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

  const portraitUrl = (characterId: string): string | null => {
    const c = characterMap.get(characterId);
    if (!c || !c.portrait) return null;
    let url = portraitUrls.current.get(characterId);
    if (!url) {
      url = URL.createObjectURL(c.portrait);
      portraitUrls.current.set(characterId, url);
    }
    return url;
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

  const handleAddFromRoster = (character: Character) => {
    const isEnemy = character.kind === 'enemy';
    const name = isEnemy ? nextEnemyName(character.name, encounter.combatants) : character.name;
    const combatant: Combatant = {
      id: crypto.randomUUID(),
      name,
      initiative: 0,
      isEnemy,
      characterId: character.id,
    };
    // Prefill HP from the character's stat block when it has a max HP, so the
    // DM starts from full without retyping it.
    if (character.stats?.hpMax != null) {
      combatant.hpMax = character.stats.hpMax;
      combatant.hpCurrent = character.stats.hpMax;
    }
    commit({ ...encounter, combatants: [...encounter.combatants, combatant] });
    pendingFocusRef.current = combatant.id;
    setRosterOpen(false);
  };

  const openRoster = () => {
    setRosterOpen((v) => {
      if (!v) listCharacters().then(setCharacters).catch(console.error);
      return !v;
    });
    setEncountersOpen(false);
  };

  const openEncounters = () => {
    setEncountersOpen((v) => {
      if (!v) listSavedEncounters().then(setSavedEncounters).catch(console.error);
      return !v;
    });
    setRosterOpen(false);
  };

  const handleSaveEncounter = async () => {
    const name = saveName.trim();
    if (!name || encounter.combatants.length === 0) return;
    // A template, not a snapshot: enemies keep only their base name (the #N
    // is re-derived on load), and initiative/current HP/effects are dropped.
    const members: SavedEncounterMember[] = sorted.map((c) => {
      const m: SavedEncounterMember = {
        name: c.isEnemy ? c.name.replace(/ #\d+$/, '') : c.name,
        isEnemy: !!c.isEnemy,
      };
      if (c.characterId) m.characterId = c.characterId;
      if (c.hpMax != null) m.hpMax = c.hpMax;
      return m;
    });
    const now = Date.now();
    try {
      await saveSavedEncounter({ id: crypto.randomUUID(), name, members, createdAt: now, updatedAt: now });
      setSaveName('');
      setSavedEncounters(await listSavedEncounters());
    } catch (err) {
      console.error(err);
    }
  };

  const handleLoadEncounter = (se: SavedEncounter) => {
    const working = [...encounter.combatants];
    for (const m of se.members) {
      // PCs dedupe by name so loading an ambush doesn't double the party
      // that's already seated; enemies always add, freshly numbered.
      if (!m.isEnemy && working.some((c) => c.name === m.name)) continue;
      const combatant: Combatant = {
        id: crypto.randomUUID(),
        name: m.isEnemy ? nextEnemyName(m.name, working) : m.name,
        initiative: 0,
      };
      if (m.isEnemy) combatant.isEnemy = true;
      if (m.characterId) combatant.characterId = m.characterId;
      const hpMax = (m.characterId ? characterMap.get(m.characterId)?.stats?.hpMax : undefined) ?? m.hpMax;
      if (hpMax != null) {
        combatant.hpMax = hpMax;
        combatant.hpCurrent = hpMax;
      }
      working.push(combatant);
    }
    commit({ ...encounter, combatants: working });
    setEncountersOpen(false);
  };

  const handleDeleteSaved = async (id: string) => {
    try {
      await deleteSavedEncounter(id);
      setConfirmDeleteSavedId(null);
      setSavedEncounters(await listSavedEncounters());
    } catch (err) {
      console.error(err);
    }
  };

  /** Seat every party-flagged PC at once (dedupe by name, so pressing it
   * twice — or after loading a saved encounter — never doubles the party).
   * Re-reads the roster first in case party flags changed in another tab. */
  const handleAddParty = async () => {
    let roster = characters;
    try {
      roster = await listCharacters();
      setCharacters(roster);
    } catch (err) {
      console.error(err);
    }
    const party = roster.filter((c) => c.kind === 'pc' && c.inParty);
    const working = [...encounter.combatants];
    for (const ch of party) {
      if (working.some((c) => c.name === ch.name)) continue;
      const combatant: Combatant = { id: crypto.randomUUID(), name: ch.name, initiative: 0, characterId: ch.id };
      if (ch.stats?.hpMax != null) {
        combatant.hpMax = ch.stats.hpMax;
        combatant.hpCurrent = ch.stats.hpMax;
      }
      working.push(combatant);
    }
    if (working.length !== encounter.combatants.length) {
      commit({ ...encounter, combatants: working });
    }
  };

  const patchCombatant = (id: string, patch: Partial<Combatant>) => {
    commit({
      ...encounter,
      combatants: encounter.combatants.map((x) => (x.id === id ? { ...x, ...patch } : x)),
    });
  };

  const setEffects = (id: string, effects: CombatantEffect[]) => {
    patchCombatant(id, { effects: effects.length ? effects : undefined });
  };

  const addEffect = (c: Combatant, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const current = c.effects ?? [];
    if (current.some((e) => e.name === trimmed)) return;
    const rounds = effectRounds.trim() === '' ? undefined : Math.max(1, Math.round(Number(effectRounds)) || 1);
    setEffects(c.id, [...current, rounds != null ? { name: trimmed, rounds } : { name: trimmed }]);
  };

  const removeEffect = (c: Combatant, name: string) => {
    setEffects(c.id, (c.effects ?? []).filter((e) => e.name !== name));
  };

  const toggleExpand = (id: string) => {
    setExpandedId((cur) => (cur === id ? null : id));
    setCustomEffect('');
    setEffectRounds('');
  };

  const toggleCompact = () => {
    setCompact((v) => {
      savePref(PREF_COMPACT, !v);
      return !v;
    });
  };

  const toggleReference = () => {
    setShowReference((v) => {
      savePref(PREF_REFERENCE, !v);
      return !v;
    });
  };

  const handleNextTurn = () => {
    const alive = sorted.filter((c) => !c.down);
    if (alive.length === 0) return;

    // Find the next combatant that isn't down; wrapping past the top of the
    // order starts a new round.
    const idx = encounter.currentTurnId ? sorted.findIndex((c) => c.id === encounter.currentTurnId) : -1;
    let nextId: string;
    let wrapped = false;
    if (idx === -1) {
      nextId = alive[0].id;
    } else {
      let step = 1;
      while (sorted[(idx + step) % sorted.length].down) step++;
      nextId = sorted[(idx + step) % sorted.length].id;
      wrapped = idx + step >= sorted.length;
    }

    // The turn that just ended ticks its timed effects down; expired ones
    // clear. (End-of-turn, so a 1-round effect stays visible while that
    // combatant's turn is being played.)
    const endingId = encounter.currentTurnId;
    const combatants = endingId
      ? encounter.combatants.map((c) => {
          if (c.id !== endingId || !c.effects) return c;
          const ticked = c.effects
            .map((e) => (e.rounds != null ? { ...e, rounds: e.rounds - 1 } : e))
            .filter((e) => e.rounds == null || e.rounds > 0);
          return { ...c, effects: ticked.length ? ticked : undefined };
        })
      : encounter.combatants;

    commit({
      ...encounter,
      combatants,
      currentTurnId: nextId,
      round: wrapped ? encounter.round + 1 : Math.max(1, encounter.round),
    });
  };

  const handleReset = () => {
    commit({ ...encounter, round: 0, currentTurnId: null, combatants: [] });
    setConfirmingReset(false);
    setExpandedId(null);
  };

  const pcs = characters.filter((c) => c.kind === 'pc');
  const enemies = characters.filter((c) => c.kind === 'enemy');

  // One reference card per distinct enemy roster character in the encounter
  // (Goblin #1–#3 share a single card), in initiative order of first
  // appearance. Pinned on the left so enemy stats stay in view during combat.
  const refCards: { character: Character; instances: Combatant[] }[] = [];
  for (const c of sorted) {
    if (!c.isEnemy || !c.characterId) continue;
    const character = characterMap.get(c.characterId);
    if (!character) continue;
    const existing = refCards.find((r) => r.character.id === character.id);
    if (existing) existing.instances.push(c);
    else refCards.push({ character, instances: [c] });
  }

  const referenceRail = showReference && refCards.length > 0 && (
    <aside className="initiative-reference">
      <h4 className="initiative-reference-title">
        <IconUsers size={13} />
        Enemy reference
      </h4>
      <div className="initiative-reference-list">
        {refCards.map(({ character, instances }) => (
          <section key={character.id} className="initiative-refcard">
            <header className="initiative-refcard-head">
              <span className="initiative-refcard-portrait">
                {portraitUrl(character.id) ? <img src={portraitUrl(character.id)!} alt="" /> : <IconPortrait size={18} />}
              </span>
              <h5 className="initiative-refcard-name">{character.name}</h5>
            </header>
            <StatBlock character={character} />
            <div className="initiative-refcard-instances">
              {instances.map((i) => (
                <div
                  key={i.id}
                  className={`initiative-refcard-instance ${i.id === encounter.currentTurnId ? 'initiative-refcard-instance-active' : ''} ${i.down ? 'initiative-refcard-instance-down' : ''}`}
                >
                  <span className="initiative-refcard-instname">{i.name}</span>
                  <HpBar combatant={i} />
                  <span className="initiative-refcard-hp">
                    {i.hpMax != null ? `${i.hpCurrent ?? i.hpMax}/${i.hpMax}` : '—'}
                  </span>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </aside>
  );

  // Compact mode: the panel folds into a slim turn-order strip — big
  // portraits, HP slivers, next-turn — so combat stays visible without
  // covering the map. Tapping a portrait reopens the full panel on that
  // combatant's details.
  if (compact) {
    return (
      <>
        {referenceRail}
        <div className="initiative-panel initiative-panel-compact">
          <button className="btn btn-ghost btn-sm" onClick={toggleCompact} title="Expand the initiative panel">
            <IconChevronsLeft size={14} />
          </button>
          {encounter.round > 0 && (
            <span className="initiative-compact-round" title={`Round ${encounter.round}`}>
              {encounter.round}
            </span>
          )}
          <div className="initiative-compact-list">
            {sorted.map((c) => {
              const url = c.characterId ? portraitUrl(c.characterId) : null;
              return (
                <button
                  key={c.id}
                  className={`initiative-compact-item ${c.id === encounter.currentTurnId ? 'initiative-compact-item-active' : ''} ${c.isEnemy ? 'initiative-compact-item-enemy' : ''} ${c.down ? 'initiative-compact-item-down' : ''}`}
                  title={`${c.name}${c.hpMax != null ? ` — ${c.hpCurrent ?? c.hpMax}/${c.hpMax} HP` : ''}${c.down ? ' — down' : ''}`}
                  onClick={() => {
                    setCompact(false);
                    savePref(PREF_COMPACT, false);
                    setExpandedId(c.id);
                  }}
                >
                  <span className="initiative-compact-portrait">
                    {url ? (
                      <img src={url} alt="" />
                    ) : (
                      <span className="initiative-compact-initial">{(c.name.trim().charAt(0) || '?').toUpperCase()}</span>
                    )}
                  </span>
                  <HpBar combatant={c} className="initiative-compact-hpbar" />
                </button>
              );
            })}
          </div>
          <button
            className="btn btn-primary btn-sm"
            onClick={handleNextTurn}
            disabled={sorted.length === 0}
            title="Next turn"
          >
            <IconInitiative size={14} />
          </button>
        </div>
      </>
    );
  }

  return (
    <>
    {referenceRail}
    <div className="initiative-panel">
      <header className="initiative-header">
        <h3>
          <IconInitiative size={16} />
          Initiative
          {encounter.round > 0 && <span className="initiative-round">Round {encounter.round}</span>}
        </h3>
        <div className="initiative-header-actions">
          <button
            className={`btn btn-ghost btn-sm ${showReference && refCards.length > 0 ? 'initiative-header-btn-active' : ''}`}
            onClick={toggleReference}
            disabled={refCards.length === 0}
            title={
              refCards.length === 0
                ? 'Enemy reference cards appear here once roster enemies join the encounter'
                : showReference
                  ? 'Hide the enemy reference cards'
                  : 'Pin enemy reference cards on the left'
            }
          >
            <IconUsers size={14} />
          </button>
          <button className="btn btn-ghost btn-sm" onClick={toggleCompact} title="Collapse to a portrait turn-order strip">
            <IconChevronsRight size={14} />
          </button>
          <button className="btn btn-ghost btn-sm" onClick={onClose} title="Close">
            <IconClose size={14} />
          </button>
        </div>
      </header>

      <div className="initiative-list">
        {sorted.length === 0 ? (
          <p className="initiative-empty">Add combatants below to start tracking turns.</p>
        ) : (
          sorted.map((c) => {
            const expanded = expandedId === c.id;
            const avatarUrl = c.characterId ? portraitUrl(c.characterId) : null;
            const effects = c.effects ?? [];
            return (
              <div
                key={c.id}
                className={`initiative-row ${c.id === encounter.currentTurnId ? 'initiative-row-active' : ''} ${c.isEnemy ? 'initiative-row-enemy' : ''} ${expanded ? 'initiative-row-expanded' : ''} ${c.down ? 'initiative-row-down' : ''}`}
              >
                <div className="initiative-row-main">
                  <button
                    className={`initiative-toggle ${expanded ? 'initiative-toggle-open' : ''} ${c.characterId ? 'initiative-toggle-avatar' : ''}`}
                    onClick={() => toggleExpand(c.id)}
                    title={expanded ? 'Hide details' : 'Show stats & effects'}
                    aria-expanded={expanded}
                  >
                    {c.characterId ? (
                      avatarUrl ? (
                        <img src={avatarUrl} alt="" />
                      ) : (
                        <IconPortrait size={20} />
                      )
                    ) : (
                      <IconChevron size={16} />
                    )}
                  </button>
                  <input
                    type="checkbox"
                    className="initiative-enemy-checkbox"
                    checked={!!c.isEnemy}
                    title="Enemy — shown to players so they can spot enemy turns"
                    onChange={(e) => patchCombatant(c.id, { isEnemy: e.target.checked })}
                  />
                  <input
                    className="initiative-name-input"
                    value={c.name}
                    onChange={(e) => patchCombatant(c.id, { name: e.target.value })}
                  />
                  <input
                    ref={(el) => {
                      if (el) rowInitRefs.current.set(c.id, el);
                      else rowInitRefs.current.delete(c.id);
                    }}
                    type="number"
                    className="initiative-init-input"
                    value={c.initiative}
                    title="Initiative"
                    onChange={(e) => patchCombatant(c.id, { initiative: Number(e.target.value) || 0 })}
                  />
                  <div className="initiative-hp" title="HP (DM only — never shown to players)">
                    <input
                      type="number"
                      className="initiative-hp-input"
                      placeholder="HP"
                      value={c.hpCurrent ?? ''}
                      onChange={(e) =>
                        patchCombatant(c.id, {
                          hpCurrent: e.target.value === '' ? undefined : Number(e.target.value),
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
                        patchCombatant(c.id, {
                          hpMax: e.target.value === '' ? undefined : Number(e.target.value),
                        })
                      }
                    />
                  </div>
                  <button
                    className={`btn btn-ghost btn-sm initiative-down-btn ${c.down ? 'initiative-down-btn-active' : ''}`}
                    onClick={() => patchCombatant(c.id, { down: c.down ? undefined : true })}
                    title={c.down ? 'Back up — rejoins the turn order' : 'Mark down/dead — greyed out and skipped by Next Turn'}
                  >
                    <IconSkull size={14} />
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => commit({ ...encounter, combatants: encounter.combatants.filter((x) => x.id !== c.id) })}
                    title="Remove"
                  >
                    <IconTrash size={14} />
                  </button>
                </div>

                <HpBar combatant={c} />

                {effects.length > 0 && (
                  <div className="initiative-row-effects" title="Active effects (DM only)">
                    {effects.map((e) => (
                      <span key={e.name} className="initiative-effect-tag">
                        {e.name}
                        {e.rounds != null && <span className="initiative-effect-rounds">{e.rounds}</span>}
                      </span>
                    ))}
                  </div>
                )}

                {expanded && (
                  <div className="initiative-detail">
                    <StatBlock character={c.characterId ? characterMap.get(c.characterId) : undefined} />
                    <div className="initiative-effects-editor">
                      <div className="initiative-effects-current">
                        {effects.length === 0 ? (
                          <span className="initiative-detail-hint">No active effects.</span>
                        ) : (
                          effects.map((e) => (
                            <button
                              key={e.name}
                              className="initiative-effect-badge"
                              onClick={() => removeEffect(c, e.name)}
                              title={e.rounds != null ? `${e.rounds} round${e.rounds === 1 ? '' : 's'} left — click to remove` : 'Remove effect'}
                            >
                              {e.name}
                              {e.rounds != null && <span className="initiative-effect-rounds">{e.rounds}</span>}
                              <IconClose size={11} />
                            </button>
                          ))
                        )}
                      </div>
                      <div className="initiative-effects-quick">
                        {COMMON_CONDITIONS.map((cond) => {
                          const active = effects.some((e) => e.name === cond);
                          return (
                            <button
                              key={cond}
                              className={`initiative-effect-quick ${active ? 'initiative-effect-quick-active' : ''}`}
                              onClick={() => (active ? removeEffect(c, cond) : addEffect(c, cond))}
                            >
                              {cond}
                            </button>
                          );
                        })}
                      </div>
                      <div className="initiative-effect-addrow">
                        <input
                          className="initiative-effect-input"
                          placeholder="Custom effect…"
                          value={customEffect}
                          onChange={(e) => setCustomEffect(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key !== 'Enter') return;
                            e.preventDefault();
                            addEffect(c, customEffect);
                            setCustomEffect('');
                          }}
                        />
                        <input
                          type="number"
                          min={1}
                          className="initiative-effect-input initiative-effect-rounds-input"
                          placeholder="rounds"
                          title="Optional duration — applies to the next effect you add (quick-pick or custom) and counts down when this combatant's turn ends"
                          value={effectRounds}
                          onChange={(e) => setEffectRounds(e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <div className="initiative-roster">
        <div className="initiative-roster-buttons">
          <button
            className="btn btn-ghost btn-sm initiative-roster-btn"
            onClick={handleAddParty}
            disabled={!characters.some((c) => c.kind === 'pc' && c.inParty)}
            title={
              characters.some((c) => c.kind === 'pc' && c.inParty)
                ? `Seat the party: ${characters.filter((c) => c.kind === 'pc' && c.inParty).map((c) => c.name).join(', ')} — PCs already in the tracker are skipped`
                : 'No party yet — flag your PCs with the shield button in the Characters roster'
            }
          >
            <IconShield size={14} />
            Add party
          </button>
          <button
            className={`btn btn-ghost btn-sm initiative-roster-btn ${rosterOpen ? 'initiative-roster-btn-open' : ''}`}
            onClick={openRoster}
          >
            <IconUsers size={14} />
            From roster
          </button>
          <button
            className={`btn btn-ghost btn-sm initiative-roster-btn ${encountersOpen ? 'initiative-roster-btn-open' : ''}`}
            onClick={openEncounters}
            title="Prepped encounters — save the current fight or load one you built earlier"
          >
            <IconCollection size={14} />
            Encounters
          </button>
        </div>
        {rosterOpen && (
          <div className="initiative-roster-picker">
            {characters.length === 0 ? (
              <p className="initiative-detail-hint initiative-roster-empty">
                No roster characters yet — add some from the <strong>Characters</strong> button in the map library.
              </p>
            ) : (
              <>
                <div className="initiative-roster-group">Player Characters</div>
                {pcs.length === 0 ? (
                  <p className="initiative-detail-hint initiative-roster-empty">None yet.</p>
                ) : (
                  pcs.map((c) => (
                    <button key={c.id} className="initiative-roster-entry" onClick={() => handleAddFromRoster(c)}>
                      <span className="initiative-roster-thumb">
                        {portraitUrl(c.id) ? <img src={portraitUrl(c.id)!} alt="" /> : <IconPortrait size={15} />}
                      </span>
                      <span className="initiative-roster-name">{c.name}</span>
                      {c.inParty && (
                        <span className="initiative-roster-party" title="In the party">
                          <IconShield size={12} />
                        </span>
                      )}
                    </button>
                  ))
                )}
                <div className="initiative-roster-group">Enemies</div>
                {enemies.length === 0 ? (
                  <p className="initiative-detail-hint initiative-roster-empty">None yet.</p>
                ) : (
                  enemies.map((c) => (
                    <button key={c.id} className="initiative-roster-entry" onClick={() => handleAddFromRoster(c)}>
                      <span className="initiative-roster-thumb">
                        {portraitUrl(c.id) ? <img src={portraitUrl(c.id)!} alt="" /> : <IconPortrait size={15} />}
                      </span>
                      <span className="initiative-roster-name">{c.name}</span>
                    </button>
                  ))
                )}
              </>
            )}
          </div>
        )}
        {encountersOpen && (
          <div className="initiative-roster-picker">
            <div className="initiative-roster-group">Saved encounters</div>
            {savedEncounters.length === 0 ? (
              <p className="initiative-detail-hint initiative-roster-empty">
                None yet — build a fight below, then save it here to load with one click at the session.
              </p>
            ) : (
              savedEncounters.map((se) => (
                <div key={se.id} className="initiative-saved-row">
                  {confirmDeleteSavedId === se.id ? (
                    <>
                      <span className="confirm-label">Delete "{se.name}"?</span>
                      <button className="btn btn-danger btn-sm" onClick={() => handleDeleteSaved(se.id)}>Yes</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDeleteSavedId(null)}>Cancel</button>
                    </>
                  ) : (
                    <>
                      <button
                        className="initiative-roster-entry"
                        onClick={() => handleLoadEncounter(se)}
                        title={`Add ${se.members.length} combatant${se.members.length === 1 ? '' : 's'} to the tracker (PCs already seated are skipped)`}
                      >
                        <span className="initiative-roster-name">{se.name}</span>
                        <span className="initiative-saved-count">{se.members.length}</span>
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => setConfirmDeleteSavedId(se.id)}
                        title="Delete this saved encounter"
                      >
                        <IconTrash size={13} />
                      </button>
                    </>
                  )}
                </div>
              ))
            )}
            <div className="initiative-saved-saverow">
              <input
                className="initiative-effect-input initiative-saved-name-input"
                placeholder="Save current as…"
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return;
                  e.preventDefault();
                  handleSaveEncounter();
                }}
              />
              <button
                className="btn btn-secondary btn-sm"
                onClick={handleSaveEncounter}
                disabled={!saveName.trim() || encounter.combatants.length === 0}
              >
                Save
              </button>
            </div>
          </div>
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
    </>
  );
}
