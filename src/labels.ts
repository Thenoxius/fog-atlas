// Canvas drawing and hit-testing for map text labels, shared by the DM
// editor and the player screen. Labels live in map coordinates and are
// drawn with the canvas already transformed into map space.

import type { MapLabel } from './db';

const LINE_HEIGHT = 1.25;

function labelFont(l: MapLabel): string {
  return `${l.fontSize}px "${l.fontFamily}", serif`;
}

function lines(l: MapLabel): string[] {
  return (l.text || ' ').split('\n');
}

export interface LabelBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function measureLabel(ctx: CanvasRenderingContext2D, l: MapLabel): LabelBox {
  ctx.font = labelFont(l);
  let w = 0;
  const ls = lines(l);
  for (const line of ls) w = Math.max(w, ctx.measureText(line || ' ').width);
  const h = l.fontSize * LINE_HEIGHT * ls.length;
  return { x: l.x - w / 2, y: l.y - h / 2, w, h };
}

export function drawLabel(ctx: CanvasRenderingContext2D, l: MapLabel): void {
  ctx.font = labelFont(l);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(2, l.fontSize / 7);
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
  ctx.fillStyle = l.color;
  const ls = lines(l);
  const lineH = l.fontSize * LINE_HEIGHT;
  const startY = l.y - (lineH * (ls.length - 1)) / 2;
  ls.forEach((line, i) => {
    const yy = startY + i * lineH;
    ctx.strokeText(line, l.x, yy);
    ctx.fillText(line, l.x, yy);
  });
}

export function drawLabels(ctx: CanvasRenderingContext2D, labels: MapLabel[]): void {
  for (const l of labels) drawLabel(ctx, l);
}

/** Topmost label whose box contains the point, or null. */
export function hitTestLabel(ctx: CanvasRenderingContext2D, labels: MapLabel[], mx: number, my: number): string | null {
  for (let i = labels.length - 1; i >= 0; i--) {
    const b = measureLabel(ctx, labels[i]);
    const pad = labels[i].fontSize * 0.15;
    if (mx >= b.x - pad && mx <= b.x + b.w + pad && my >= b.y - pad && my <= b.y + b.h + pad) {
      return labels[i].id;
    }
  }
  return null;
}
