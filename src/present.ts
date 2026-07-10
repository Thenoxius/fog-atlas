// DM <-> player-screen link. Both windows run the same app on the same
// origin, so a BroadcastChannel carries live state between them with no
// server. The player window loads map images and saved fog from the shared
// IndexedDB itself; only the live (unsaved) fog and grid stream over here.

import type { GridConfig } from './grid';
import type { MapLabel, MapToken } from './db';

export const PRESENT_CHANNEL = 'fog-atlas-present';

/** Query flag that puts the app into player-screen mode. */
export const PRESENT_PARAM = 'present';

// Turn order sent to the player screen — deliberately just id + name (+
// isEnemy, which is meant to be player-visible so they can spot enemy turns
// at a glance). HP and other DM-only details never leave the DM screen.
//
// characterId links a chip to a roster Character so the player window can show
// its portrait. The portrait Blob is NEVER sent over the channel — only the id
// travels; the player window reads the Blob itself from the shared IndexedDB
// 'characters' store (same as it does for map images and fog).
export interface PublicCombatant {
  id: string;
  name: string;
  isEnemy: boolean;
  /** Downed/dead — table-visible reality (the players saw it drop), so the
   * player screen greys the chip out. HP itself still never travels. */
  down?: boolean;
  characterId?: string;
}

export interface PublicInitiativeState {
  round: number;
  currentTurnId: string | null;
  order: PublicCombatant[];
}

export type PresentMessage =
  // player -> DM: I just opened/reloaded, send me the current state
  | { type: 'hello' }
  // DM -> player: switch to this map (player loads image + saved fog from
  // IndexedDB; grid, labels, and tokens travel inline so they're right
  // immediately)
  | { type: 'scene'; mapId: string; grid: GridConfig; labels: MapLabel[]; tokens: MapToken[] }
  // DM -> player: live fog mask for the active map
  | { type: 'fog'; mapId: string; bitmap: ImageBitmap }
  // DM -> player: grid settings changed
  | { type: 'grid'; mapId: string; grid: GridConfig }
  // DM -> player: labels changed
  | { type: 'labels'; mapId: string; labels: MapLabel[] }
  // DM -> player: tokens changed
  | { type: 'tokens'; mapId: string; tokens: MapToken[] }
  // DM -> player: initiative order changed (not tied to a specific map)
  | { type: 'initiative'; state: PublicInitiativeState }
  // DM -> player: presentation ended
  | { type: 'stopped' };

export function openPresentChannel(): BroadcastChannel {
  return new BroadcastChannel(PRESENT_CHANNEL);
}
