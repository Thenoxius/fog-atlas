// DM <-> player-screen link. Both windows run the same app on the same
// origin, so a BroadcastChannel carries live state between them with no
// server. The player window loads map images and saved fog from the shared
// IndexedDB itself; only the live (unsaved) fog and grid stream over here.

import type { GridConfig } from './grid';

export const PRESENT_CHANNEL = 'fog-atlas-present';

/** Query flag that puts the app into player-screen mode. */
export const PRESENT_PARAM = 'present';

export type PresentMessage =
  // player -> DM: I just opened/reloaded, send me the current state
  | { type: 'hello' }
  // DM -> player: switch to this map (player loads image + saved fog from
  // IndexedDB; grid travels inline so it is right from the first frame)
  | { type: 'scene'; mapId: string; grid: GridConfig }
  // DM -> player: live fog mask for the active map
  | { type: 'fog'; mapId: string; bitmap: ImageBitmap }
  // DM -> player: grid settings changed
  | { type: 'grid'; mapId: string; grid: GridConfig }
  // DM -> player: presentation ended
  | { type: 'stopped' };

export function openPresentChannel(): BroadcastChannel {
  return new BroadcastChannel(PRESENT_CHANNEL);
}
