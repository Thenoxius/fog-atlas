import { useState } from 'react';
import { Library } from './Library';
import { MapEditor } from './MapEditor';
import { PlayerView } from './PlayerView';
import { PRESENT_PARAM } from './present';

const isPlayerWindow = new URLSearchParams(window.location.search).has(PRESENT_PARAM);

export default function App() {
  const [openMapId, setOpenMapId] = useState<string | null>(null);

  if (isPlayerWindow) return <PlayerView />;

  return openMapId ? (
    <MapEditor mapId={openMapId} onBack={() => setOpenMapId(null)} />
  ) : (
    <Library onOpenMap={setOpenMapId} />
  );
}
