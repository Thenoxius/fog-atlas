import { useState } from 'react';
import { Library } from './Library';
import { MapEditor } from './MapEditor';

export default function App() {
  const [openMapId, setOpenMapId] = useState<string | null>(null);

  return openMapId ? (
    <MapEditor mapId={openMapId} onBack={() => setOpenMapId(null)} />
  ) : (
    <Library onOpenMap={setOpenMapId} />
  );
}
