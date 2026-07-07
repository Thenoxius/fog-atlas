// Canvas drawing and hit-testing for DM-only notes. Used only by the DM
// editor — there is deliberately no equivalent in PlayerView.tsx, so notes
// have no code path to the player screen at all.

import type { MapNote } from './db';

/** Marker radius in constant screen pixels, regardless of zoom. */
export const NOTE_MARKER_SCREEN_RADIUS = 13;

const EMOJI_FONT = '"Segoe UI Emoji", "Noto Color Emoji", "Apple Color Emoji", sans-serif';

export function drawNoteMarkers(ctx: CanvasRenderingContext2D, notes: MapNote[], scale: number): void {
  const r = NOTE_MARKER_SCREEN_RADIUS / scale;
  for (const n of notes) {
    ctx.beginPath();
    ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
    ctx.fillStyle = '#fde68a';
    ctx.fill();
    ctx.lineWidth = Math.max(1, 2 / scale);
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.stroke();
    ctx.font = `${Math.round(r * 1.2)}px ${EMOJI_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('📝', n.x, n.y + r * 0.05);
  }
}

/** Topmost note whose marker contains the point, or null. `scale` is needed
 * because the marker's map-space radius depends on the current zoom. */
export function hitTestNote(notes: MapNote[], mx: number, my: number, scale: number): string | null {
  const r = (NOTE_MARKER_SCREEN_RADIUS / scale) * 1.3;
  for (let i = notes.length - 1; i >= 0; i--) {
    const n = notes[i];
    if (Math.hypot(mx - n.x, my - n.y) <= r) return n.id;
  }
  return null;
}
