// Canvas drawing and hit-testing for map icon tokens, shared by the DM
// editor and the player screen. Tokens live in map coordinates and are
// drawn with the canvas already transformed into map space.

import type { MapToken } from './db';

const EMOJI_FONT = '"Segoe UI Emoji", "Noto Color Emoji", "Apple Color Emoji", sans-serif';

export function drawToken(ctx: CanvasRenderingContext2D, t: MapToken): void {
  const r = t.size / 2;
  ctx.beginPath();
  ctx.arc(t.x, t.y, r, 0, Math.PI * 2);
  ctx.fillStyle = t.color;
  ctx.fill();
  ctx.lineWidth = Math.max(1.5, t.size / 20);
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.stroke();

  ctx.font = `${Math.round(t.size * 0.56)}px ${EMOJI_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // Emoji glyphs sit slightly high in their own box; nudge down a touch
  ctx.fillText(t.icon, t.x, t.y + t.size * 0.03);
}

export function drawTokens(ctx: CanvasRenderingContext2D, tokens: MapToken[]): void {
  for (const t of tokens) drawToken(ctx, t);
}

/** Topmost token whose badge circle contains the point, or null. */
export function hitTestToken(tokens: MapToken[], mx: number, my: number): string | null {
  for (let i = tokens.length - 1; i >= 0; i--) {
    const t = tokens[i];
    const rPad = t.size / 2 + Math.max(6, t.size * 0.12);
    if (Math.hypot(mx - t.x, my - t.y) <= rPad) return t.id;
  }
  return null;
}
