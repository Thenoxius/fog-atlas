# Fog Atlas — DM Map Manager

A fully local fog-of-war map tool for dungeon masters. Import your campaign maps, prepare which areas the party has explored, and take the exact fog state with you to the session — no accounts, no servers, no cloud.

## How it works

1. **Import** battle maps or region maps (any image format) into the library — via the button or by dropping files on the page.
2. **Open** a map. Maps start without fog.
3. **Prepare the fog**:
   - **Reveal** (R): use the mouse as an eraser to remove fog
   - **Fog** (F): paint fog back with the mouse
   - **Fog all** covers the entire map; **Clear fog** removes everything
   - Adjustable brush size and fog opacity (see through the fog while you prep)
   - Undo (Ctrl+Z), pan (Space/right-drag), zoom (scroll), fit (0)
4. **Take it to the session**: fog is autosaved (and via Ctrl+S / the Save button). When you reopen a map it is exactly in the state you left it.

## Everything stays local

- Maps, fog masks, and thumbnails are stored as blobs in the browser's **IndexedDB** on this machine.
- No network calls, no CDN fonts or icons, no telemetry. The app works offline once it is running.
- Storage is per browser profile: open Fog Atlas in the same browser to see your maps.

## Development

```bash
npm install
npm run dev      # start at http://localhost:5173
npm run build    # production build in dist/
npm run preview  # serve the production build locally
```

Built with Vite + React + TypeScript. No runtime dependencies beyond React; the canvas, fog compositing (`destination-out` erasing), and IndexedDB layer are hand-rolled.

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| `R` / `F` | Reveal / Fog tool |
| `[` / `]` | Smaller / larger brush |
| `Space` + drag, right-drag, or middle-drag | Pan |
| Scroll | Zoom at cursor |
| `0` | Fit map to screen |
| `Ctrl+Z` | Undo |
| `Ctrl+S` | Save fog |
