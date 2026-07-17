// First-visit demo: builds a ready-made map from the bundled collection so a
// new visitor sees the product working — half-revealed fog, an aligned grid,
// tokens, a label, and a DM-only note — within seconds of landing, instead
// of an empty library. The demo is a normal map (fixed id, "Demo" name), so
// it can be edited or deleted like anything else.

import { addMap, getMap } from './db';
import { loadCollection, collectionUrl } from './collection';
import { buildRecordFromBlob } from './mapImport';

export const DEMO_MAP_ID = 'demo-map';

/** Create (or reuse) the demo map and return its id. Throws when the bundled
 * collection isn't available (e.g. a local dev build without it). */
export async function createDemoMap(): Promise<string> {
  const existing = await getMap(DEMO_MAP_ID);
  if (existing) return DEMO_MAP_ID;

  const collection = await loadCollection();
  if (collection.length === 0) throw new Error('The bundled map collection is empty.');
  // Prefer a map whose grid size is known, so the overlay aligns perfectly.
  const pick = collection.find((m) => m.pps) ?? collection[0];

  const res = await fetch(collectionUrl(pick.file));
  if (!res.ok) throw new Error(`Could not fetch the demo map (${res.status}).`);
  const record = await buildRecordFromBlob(await res.blob(), `Demo · ${pick.name}`);
  record.id = DEMO_MAP_ID;

  const w = record.width;
  const h = record.height;

  // Fog mask: opaque everywhere, with an irregular hand-revealed clearing —
  // a cluster of erased circles along a short "explored" path.
  const fogCanvas = document.createElement('canvas');
  fogCanvas.width = w;
  fogCanvas.height = h;
  const ctx = fogCanvas.getContext('2d')!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'destination-out';
  const cx = w * 0.38;
  const cy = h * 0.58;
  const r = Math.min(w, h) * 0.16;
  const blobs: [number, number, number][] = [
    [cx, cy, r * 1.25],
    [cx + r * 1.1, cy - r * 0.7, r],
    [cx - r * 0.9, cy + r * 0.5, r * 0.9],
    [cx + r * 0.4, cy + r * 0.9, r * 0.8],
    [cx + r * 1.9, cy - r * 1.4, r * 0.75],
    [cx - r * 1.5, cy - r * 0.4, r * 0.7],
  ];
  for (const [bx, by, br] of blobs) {
    ctx.beginPath();
    ctx.arc(bx, by, br, 0, Math.PI * 2);
    ctx.fill();
  }
  record.fog = await new Promise<Blob | null>((resolve) => fogCanvas.toBlob(resolve, 'image/png'));

  // Grid aligned to the map art when the collection knows its cell size.
  record.gridType = 'square';
  record.gridSize = pick.pps ?? Math.round(w / 24);
  record.gridOffsetX = 0;
  record.gridOffsetY = 0;
  record.gridLineWidth = 1.2;
  record.gridOpacity = 0.4;

  // A little life inside the clearing, and a secret note under the fog.
  const tokenSize = (pick.pps ?? w / 24) * 1.4;
  record.tokens = [
    { id: 'demo-token-camp', icon: '🏕️', x: cx, y: cy, size: tokenSize, color: '#7a5c33' },
    { id: 'demo-token-skull', icon: '💀', x: cx + r * 1.7, y: cy - r * 1.2, size: tokenSize * 0.85, color: '#5b2d2d' },
  ];
  record.labels = [
    {
      id: 'demo-label-camp',
      text: 'The party camps here',
      x: cx,
      y: cy + r * 1.6,
      fontSize: Math.max(18, (pick.pps ?? w / 24) * 0.8),
      fontFamily: 'IM Fell English SC',
      color: '#f3e9d2',
    },
  ];
  record.notes = [
    {
      id: 'demo-note-secret',
      text: 'Only you can see notes like this — players never do, even outside the fog.',
      x: w * 0.7,
      y: h * 0.3,
    },
  ];

  await addMap(record);
  return DEMO_MAP_ID;
}
