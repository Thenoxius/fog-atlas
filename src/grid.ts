// Grid overlay geometry and drawing, shared by the DM editor and the
// player screen so both render an identical grid.

import type { GridType } from './db';

export const GRID_MIN_SIZE = 20;
export const GRID_MAX_SIZE = 400;
/** Below this on-screen cell size the grid is unreadable; skip drawing it. */
export const GRID_MIN_SCREEN_CELL = 5;

export interface GridConfig {
  gridType: GridType;
  gridSize: number;
  gridOffsetX: number;
  gridOffsetY: number;
  gridLineWidth: number;
  gridOpacity: number;
}

/**
 * Build the grid overlay as a single path in map coordinates, restricted to
 * the visible region so huge maps stay fast. Returns null when the grid is
 * off or would be too dense to read at the current zoom.
 */
export function buildGridPath(
  type: GridType,
  size: number,
  offsetX: number,
  offsetY: number,
  mapWidth: number,
  mapHeight: number,
  viewLeft: number,
  viewTop: number,
  viewRight: number,
  viewBottom: number,
  scale: number
): Path2D | null {
  if (type === 'none' || size * scale < GRID_MIN_SCREEN_CELL) return null;

  const left = Math.max(0, viewLeft);
  const top = Math.max(0, viewTop);
  const right = Math.min(mapWidth, viewRight);
  const bottom = Math.min(mapHeight, viewBottom);
  if (right <= left || bottom <= top) return null;

  const path = new Path2D();

  if (type === 'square') {
    for (let gx = Math.floor((left - offsetX) / size) * size + offsetX; gx <= right; gx += size) {
      if (gx < left) continue;
      path.moveTo(gx, top);
      path.lineTo(gx, bottom);
    }
    for (let gy = Math.floor((top - offsetY) / size) * size + offsetY; gy <= bottom; gy += size) {
      if (gy < top) continue;
      path.moveTo(left, gy);
      path.lineTo(right, gy);
    }
    return path;
  }

  // Pointy-top hexagons; `size` is the hex width (distance across flats),
  // so the circumradius is size / sqrt(3).
  const r = size / Math.sqrt(3);
  const rowStep = 1.5 * r;
  const firstRow = Math.floor((top - offsetY) / rowStep) - 1;
  const lastRow = Math.ceil((bottom - offsetY) / rowStep) + 1;
  const firstCol = Math.floor((left - offsetX) / size) - 1;
  const lastCol = Math.ceil((right - offsetX) / size) + 1;

  for (let row = firstRow; row <= lastRow; row++) {
    const cy = row * rowStep + offsetY;
    const rowShift = row % 2 !== 0 ? size / 2 : 0;
    for (let col = firstCol; col <= lastCol; col++) {
      const cx = col * size + rowShift + offsetX;
      for (let k = 0; k < 6; k++) {
        const angle = Math.PI / 6 + (k * Math.PI) / 3;
        const px = cx + r * Math.cos(angle);
        const py = cy + r * Math.sin(angle);
        if (k === 0) path.moveTo(px, py);
        else path.lineTo(px, py);
      }
      path.closePath();
    }
  }
  return path;
}

/**
 * Stroke a grid path with the dark-under-light pair. The canvas must already
 * be transformed into map space; lineWidth is given in screen pixels and
 * divided by scale so it stays constant while zooming.
 */
export function strokeGrid(
  ctx: CanvasRenderingContext2D,
  path: Path2D,
  scale: number,
  lineWidth: number,
  visibility: number,
  mapWidth: number,
  mapHeight: number
): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, mapWidth, mapHeight);
  ctx.clip();
  ctx.lineWidth = (lineWidth * 2.1) / scale;
  ctx.strokeStyle = `rgba(8, 10, 16, ${0.72 * visibility})`;
  ctx.stroke(path);
  ctx.lineWidth = lineWidth / scale;
  ctx.strokeStyle = `rgba(255, 255, 255, ${0.8 * visibility})`;
  ctx.stroke(path);
  ctx.restore();
}
