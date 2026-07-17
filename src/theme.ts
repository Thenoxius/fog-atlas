// Theme preference — per device, in localStorage. The default (Atlas) needs
// no data-theme attribute; index.html applies a stored choice before first
// paint so pages never flash parchment on a dark-theme device.

export interface ThemeOption {
  id: string;
  name: string;
  /** Swatch gradient for the picker dot. */
  swatch: string;
}

export const THEMES: ThemeOption[] = [
  { id: 'atlas', name: "Cartographer's Atlas — parchment & ink", swatch: 'linear-gradient(135deg, #e9dcbd, #2e5578)' },
  { id: 'war-table', name: "The DM's War Table — oak & brass", swatch: 'linear-gradient(135deg, #241710, #c9a35c)' },
  { id: 'slate', name: 'Slate — the modern dark', swatch: 'linear-gradient(135deg, #1a202b, #4f7cff)' },
];

export const DEFAULT_THEME = 'atlas';
const KEY = 'fog-atlas-theme';

export function loadTheme(): string {
  const stored = localStorage.getItem(KEY);
  return stored && THEMES.some((t) => t.id === stored) ? stored : DEFAULT_THEME;
}

export function applyTheme(id: string): void {
  if (id === DEFAULT_THEME) {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', id);
  }
  localStorage.setItem(KEY, id);
}
