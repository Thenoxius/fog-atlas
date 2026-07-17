// Measurement / spell-template rendering shared by the DM editor and the
// player screen: rulers, radius circles, and 5e cones (width at any distance
// equals that distance). Distances derive from the grid cell size with the
// standard 5 ft per cell — shown even when the grid overlay is hidden.

import type { MapShape } from './db';

/** Swatches offered in the measure panel — vivid spell-energy colors that
 * read on any map art, independent of the UI theme. */
export const SHAPE_COLORS = [
  '#e5484d', // fire red
  '#f08c2e', // ember orange
  '#ffd23f', // radiant gold
  '#46c98c', // acid green
  '#4f9bff', // frost blue
  '#a06bfa', // arcane violet
  '#f2f0e9', // force white
];

export const DEFAULT_SHAPE_COLOR = SHAPE_COLORS[0];

const FEET_PER_CELL = 5;

function feetLabel(distancePx: number, gridSize: number): string {
  const cells = distancePx / Math.max(1, gridSize);
  const feet = cells * FEET_PER_CELL;
  // Round to whole feet; snap near-multiples of 5 to the clean number DMs say
  const rounded = Math.round(feet);
  const snapped = Math.abs(rounded - Math.round(rounded / 5) * 5) <= 1 ? Math.round(rounded / 5) * 5 : rounded;
  return `${snapped} ft`;
}

/** The cone's three corners: apex at (x, y), far edge centered on (x2, y2),
 * end width equal to its length (PHB cone). */
export function conePoints(s: MapShape): [number, number][] {
  const dx = s.x2 - s.x;
  const dy = s.y2 - s.y;
  const len = Math.hypot(dx, dy);
  if (len < 0.001) return [[s.x, s.y], [s.x, s.y], [s.x, s.y]];
  const px = -dy / len;
  const py = dx / len;
  const half = len / 2;
  return [
    [s.x, s.y],
    [s.x2 + px * half, s.y2 + py * half],
    [s.x2 - px * half, s.y2 - py * half],
  ];
}

function drawDistanceLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string,
  scale: number
) {
  const size = 15 / scale;
  ctx.font = `600 ${size}px -apple-system, "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 3.5 / scale;
  ctx.strokeStyle = 'rgba(10, 8, 4, 0.85)';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

/** Draw all shapes in map coordinates. `scale` is the current view scale so
 * line widths and labels stay a constant size on screen. */
export function drawShapes(
  ctx: CanvasRenderingContext2D,
  shapes: MapShape[],
  gridSize: number,
  scale: number,
  selectedId?: string | null
) {
  for (const s of shapes) {
    const len = Math.hypot(s.x2 - s.x, s.y2 - s.y);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    if (s.kind === 'ruler') {
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 3 / scale;
      ctx.setLineDash([10 / scale, 6 / scale]);
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(s.x2, s.y2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = s.color;
      for (const [ex, ey] of [[s.x, s.y], [s.x2, s.y2]] as const) {
        ctx.beginPath();
        ctx.arc(ex, ey, 4 / scale, 0, Math.PI * 2);
        ctx.fill();
      }
      drawDistanceLabel(ctx, feetLabel(len, gridSize), (s.x + s.x2) / 2, (s.y + s.y2) / 2 - 14 / scale, s.color, scale);
    } else if (s.kind === 'circle') {
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.arc(s.x, s.y, len, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 2.5 / scale;
      ctx.stroke();
      drawDistanceLabel(ctx, `${feetLabel(len, gridSize)} radius`, s.x, s.y, s.color, scale);
    } else {
      const [apex, p1, p2] = conePoints(s);
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.moveTo(apex[0], apex[1]);
      ctx.lineTo(p1[0], p1[1]);
      ctx.lineTo(p2[0], p2[1]);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 2.5 / scale;
      ctx.stroke();
      drawDistanceLabel(ctx, `${feetLabel(len, gridSize)} cone`, s.x2, s.y2, s.color, scale);
    }

    if (selectedId === s.id) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.lineWidth = 1.5 / scale;
      ctx.setLineDash([6 / scale, 4 / scale]);
      if (s.kind === 'circle') {
        ctx.beginPath();
        ctx.arc(s.x, s.y, len + 6 / scale, 0, Math.PI * 2);
        ctx.stroke();
      } else if (s.kind === 'cone') {
        const [apex, p1, p2] = conePoints(s);
        ctx.beginPath();
        ctx.moveTo(apex[0], apex[1]);
        ctx.lineTo(p1[0], p1[1]);
        ctx.lineTo(p2[0], p2[1]);
        ctx.closePath();
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(s.x2, s.y2);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }
  }
}

function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function pointInTriangle(px: number, py: number, pts: [number, number][]): boolean {
  const [[ax, ay], [bx, by], [cx, cy]] = pts;
  const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by);
  const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy);
  const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}

/** Topmost shape under the point, or null. Tolerance shrinks with zoom so
 * hit areas stay a constant size on screen. */
export function hitTestShape(shapes: MapShape[], x: number, y: number, scale: number): string | null {
  const tol = 12 / scale;
  for (let i = shapes.length - 1; i >= 0; i--) {
    const s = shapes[i];
    const len = Math.hypot(s.x2 - s.x, s.y2 - s.y);
    if (s.kind === 'ruler') {
      if (distToSegment(x, y, s.x, s.y, s.x2, s.y2) <= tol) return s.id;
    } else if (s.kind === 'circle') {
      if (Math.hypot(x - s.x, y - s.y) <= len + tol) return s.id;
    } else {
      if (pointInTriangle(x, y, conePoints(s))) return s.id;
      if (distToSegment(x, y, s.x, s.y, s.x2, s.y2) <= tol) return s.id;
    }
  }
  return null;
}
