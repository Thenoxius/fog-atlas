# Fog Atlas — DM Map Manager

A fully local fog-of-war map tool for dungeon masters. Import your campaign maps, prepare which areas the party has explored, and take the exact fog state with you to the session — no accounts, no servers, no cloud.

## How it works

1. **Import** battle maps or region maps (any image format) into the library — via the button or by dropping files on the page. Or open the **Map Collection**: hundreds of battle maps that ship with the app, searchable and grouped by campaign/series, added to your library with one click (grid size is prefilled from the map's pixels-per-square when known).
2. **Open** a map. Maps start without fog.
3. **Prepare the fog**:
   - **Reveal** (R): use the mouse as an eraser to remove fog
   - **Fog** (F): paint fog back with the mouse
   - **Fog all** covers the entire map; **Clear fog** removes everything
   - Adjustable brush size and fog opacity (see through the fog while you prep)
   - Undo (Ctrl+Z), pan (Space/right-drag), zoom (scroll), fit (0)
   - Fullscreen button for distraction-free prep and play at the table
4. **Grid overlay** (G): project a honeycomb (hex) or square grid on top of the map, with sliders for cell size (scale), X/Y offset (to line the overlay up with a grid baked into the map art), line thickness, and visibility. The grid draws above the fog so you can measure through it, and all settings are remembered per map.
5. **Multi-map scenes**: use the scene bar at the bottom of the editor to link several maps into one scene — e.g. a house and the upper floor you climb the stairs to. Each map keeps its own fog. Switch between them with a click; the library groups a scene into a single card.
6. **Take it to the session**: fog is autosaved (and via Ctrl+S / the Save button). When you reopen a map it is exactly in the state you left it.

## The two-screen setup (laptop + TV)

Fog Atlas runs two screens: your **DM screen** and a **player screen** on a second display (a TV or monitor that acts as the board).

- On your laptop, click **Player screen** in the editor toolbar. A second window opens — drag it onto the TV and press its fullscreen button.
- The player window shows the whole map fit to the screen, with the grid and **fully opaque black fog** — players see only what you've revealed.
- Your DM screen shows the fog **semi-transparent** (adjust with the *DM fog* slider) so you can see what lies underneath and decide what to reveal.
- As you reveal or re-cover fog on your screen, the player screen updates **live**. Switching maps in a scene switches the player screen too.

Both windows run entirely on your machine and communicate directly in the browser — nothing is sent over a network.

## Everything stays local

- Maps, fog masks, and thumbnails are stored as blobs in the browser's **IndexedDB** on this machine.
- No network calls, no CDN fonts or icons, no telemetry. The app works offline once it is running.
- Storage is per browser profile: open Fog Atlas in the same browser to see your maps.

## Support

Fog Atlas is free and open. If it earns a place at your table, you can [buy me a coffee on Ko-fi](https://ko-fi.com/thenoxius). ☕

## Development

```bash
npm install
npm run dev      # start at http://localhost:5173
npm run build    # production build in dist/
npm run preview  # serve the production build locally
```

Built with Vite + React + TypeScript. No runtime dependencies beyond React; the canvas, fog compositing (`destination-out` erasing), and IndexedDB layer are hand-rolled.

### The bundled map collection

The DM's original map files live in `assets/` (gitignored — 2.4+ GB doesn't fit GitHub or Pages). The repo ships web-optimized copies instead, generated into `public/collection/` (max 3000px WebP + thumbnails + `manifest.json`) by:

```bash
node scripts/build-collection.mjs
```

Re-run it after adding maps to `assets/Battlemaps/<Series>/`; the script is incremental and parses grid dimensions and pixels-per-square from the filenames.

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| `R` / `F` | Reveal / Fog tool |
| `[` / `]` | Smaller / larger brush |
| `G` | Cycle grid overlay: none → hex → square |
| `Space` + drag, right-drag, or middle-drag | Pan |
| Scroll | Zoom at cursor |
| `0` | Fit map to screen |
| `Ctrl+Z` | Undo |
| `Ctrl+S` | Save fog |
