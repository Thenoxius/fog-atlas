// Default token icons for marking things on the map (campsites, known
// dangers, points of interest...). Rendered as system color emoji, so no
// icon assets need to be bundled or downloaded — every OS ships an
// emoji-capable font already.

export interface TokenIconDef {
  id: string;
  icon: string;
  label: string;
}

export const TOKEN_ICONS: TokenIconDef[] = [
  { id: 'campfire', icon: '🔥', label: 'Campfire' },
  { id: 'camp', icon: '⛺', label: 'Camp' },
  { id: 'skull', icon: '💀', label: 'Skull' },
  { id: 'danger', icon: '☠️', label: 'Danger' },
  { id: 'boss', icon: '👑', label: 'Boss' },
  { id: 'dragon', icon: '🐉', label: 'Dragon' },
  { id: 'battle', icon: '⚔️', label: 'Battle' },
  { id: 'treasure', icon: '💰', label: 'Treasure' },
  { id: 'star', icon: '⭐', label: 'Star' },
  { id: 'important', icon: '❗', label: 'Important' },
  { id: 'mystery', icon: '❓', label: 'Mystery' },
  { id: 'door', icon: '🚪', label: 'Door' },
  { id: 'eye', icon: '👁️', label: 'Watched' },
  { id: 'flag', icon: '🚩', label: 'Flag' },
];

export const DEFAULT_TOKEN_ICON = TOKEN_ICONS[0].icon;

// Solid, saturated colors that read clearly as a badge on any map art
export const TOKEN_COLORS = [
  '#dc2626', '#ea580c', '#f59e0b', '#16a34a',
  '#0891b2', '#2563eb', '#7c3aed', '#f5f5f4',
];

export const DEFAULT_TOKEN_COLOR = TOKEN_COLORS[0];
