// Bundled fonts for map labels. Imported here as side effects so Vite
// packages the woff2 files into the build — no CDN, stays fully offline.
import '@fontsource/cinzel';
import '@fontsource/uncial-antiqua';
import '@fontsource/medievalsharp';
import '@fontsource/im-fell-english-sc';
import '@fontsource/grenze-gotisch';

export interface MapFont {
  /** Short name shown in the picker. */
  label: string;
  /** CSS font-family. */
  family: string;
}

// A handful of fonts that suit fantasy / D&D maps, plus a plain option.
export const MAP_FONTS: MapFont[] = [
  { label: 'Cinzel', family: 'Cinzel' },
  { label: 'Uncial', family: 'Uncial Antiqua' },
  { label: 'Medieval', family: 'MedievalSharp' },
  { label: 'Old Book', family: 'IM Fell English SC' },
  { label: 'Gothic', family: 'Grenze Gotisch' },
  { label: 'Plain', family: 'system-ui' },
];

export const DEFAULT_FONT = 'Cinzel';

// Label colors tuned for map backgrounds
export const LABEL_COLORS = ['#f5e6c8', '#ffffff', '#111111', '#7a1f1f', '#1f3a7a', '#1f5a2e'];

// Trigger loading of the bundled fonts so canvas text renders in the right
// face; resolves once they're ready (or immediately if already loaded).
export function ensureMapFontsLoaded(): Promise<unknown> {
  const families = MAP_FONTS.filter((f) => f.family !== 'system-ui');
  return Promise.all(families.map((f) => document.fonts.load(`32px "${f.family}"`))).catch(() => {});
}
