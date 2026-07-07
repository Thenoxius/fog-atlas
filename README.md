# Fog Atlas — DM Map Manager

A fully local fog-of-war map tool for dungeon masters. Import your campaign maps, prepare which areas the party has explored, and take the exact fog state with you to the session — no accounts, no servers, no cloud.

**▶ Try it: [thenoxius.github.io/fog-atlas](https://thenoxius.github.io/fog-atlas/)** — runs entirely in your browser; your maps never leave your device.

## Features

- **Fog of war** you paint and erase with the mouse, autosaved per map and restored exactly when you reopen it.
- **Two-screen play** — a DM screen on your laptop and a live player screen on the TV; reveal on one, players see it on the other.
- **Hex or square grid** overlay with adjustable size, alignment, line thickness, and visibility.
- **Text labels** in several fantasy fonts — name regions and rooms; they reveal with the fog on the player screen.
- **Icon tokens** (campfire, skull, boss, treasure, and more) in a customizable color — mark campsites, dangers, and points of interest.
- **Multi-map scenes** — link maps (e.g. a building and its upper floor), each with its own fog.
- **Bundled map collection** — hundreds of battle maps ready to use, plus your own uploads.
- **Rectangle reveal** — drag a shape to reveal or fog a whole room at once, instead of only brushing it in.
- **Initiative tracker** — add combatants, auto-sorted by initiative, with a synced turn-order bar on the player screen.
- **DM notes** — pin private notes anywhere on the map for your own reference; they never sync to the player screen, not even hidden under fog.
- **100% local** — everything lives in your browser's storage; works offline.

## How it works

1. **Import** battle maps or region maps (any image format) into the library — via the button or by dropping files on the page. Or open the **Map Collection**: hundreds of battle maps that ship with the app, searchable and grouped by campaign/series, added to your library with one click (grid size is prefilled from the map's pixels-per-square when known).
2. **Open** a map. Maps start without fog.
3. **Prepare the fog**:
   - **Reveal** (R): use the mouse as an eraser to remove fog
   - **Fog** (F): paint fog back with the mouse
   - **Fog all** covers the entire map; **Clear fog** removes everything
   - **Brush shape** (B): freehand round brush, or **Rectangle** — drag out a shape to reveal/fog a whole room in one action
   - Adjustable brush size and fog opacity (see through the fog while you prep)
   - Undo (Ctrl+Z), pan (Space/right-drag), zoom (scroll), fit (0)
   - Fullscreen button for distraction-free prep and play at the table
4. **Grid overlay** (G): project a honeycomb (hex) or square grid on top of the map, with sliders for cell size (scale), X/Y offset (to line the overlay up with a grid baked into the map art), line thickness, and visibility. The grid draws above the fog so you can measure through it, and all settings are remembered per map.
5. **Text labels** (T): with the Text tool, click the map to drop a label, then type it and pick from several fantasy fonts (Cinzel, Uncial, Medieval, Old Book, Gothic, or plain), a size, and a color. Drag labels to move them, use the corner handle (or the size slider) to scale, and delete with the panel button or the Del key. Labels are stored per map; on the player screen they sit under the fog, so a region name is revealed only once you clear the fog over it.
6. **Icon tokens** (K): with the Token tool, click the map to drop a marker, then pick from default icons (campfire, camp, skull, danger, boss, dragon, battle, treasure, star, important, mystery, door, watched, flag) and a background color. Drag to move, use the corner handle (or the size slider) to scale, and delete with the panel button or the Del key. Like labels, tokens sit under the fog on the player screen — mark a campsite or a boss's lair ahead of time and it stays hidden until the party finds it.
7. **Multi-map scenes**: use the scene bar at the bottom of the editor to link several maps into one scene — e.g. a house and the upper floor you climb the stairs to. Each map keeps its own fog. Switch between them with a click; the library groups a scene into a single card.
8. **Initiative tracker**: click **Initiative** in the toolbar to open the panel. Add combatants with a name and initiative score — they're auto-sorted highest first. **Next Turn** advances through the order and counts rounds; HP is optional and tracked for your reference only (it's never sent to the player screen). The encounter is global (not tied to one map), survives page reloads, and its turn order streams live to the player screen as a compact bar with the current turn highlighted — no HP, just names.
9. **Notes** (N): with the Note tool, click the map to drop a private marker, then type anything you want — a trap DC, a plot reminder, a secret door. Drag to move, delete with the panel button or the Del key. Notes are for your eyes only: there is no code path that sends them anywhere, so even when you're presenting to a player screen they stay invisible, unlike labels/tokens which are merely hidden under fog.
10. **Take it to the session**: fog is autosaved (and via Ctrl+S / the Save button). When you reopen a map it is exactly in the state you left it.

The bundled fantasy fonts are packaged into the app (via `@fontsource`), so they work offline like everything else. Token icons are rendered as system color emoji — no icon assets to download either.

## The two-screen setup (laptop + TV)

Fog Atlas runs two screens: your **DM screen** and a **player screen** on a second display (a TV or monitor that acts as the board).

- On your laptop, click **Player screen** in the editor toolbar. A second window opens — drag it onto the TV and press its fullscreen button.
- The player window shows the whole map fit to the screen, with the grid and **fully opaque black fog** — players see only what you've revealed.
- Your DM screen shows the fog **semi-transparent** (adjust with the *DM fog* slider) so you can see what lies underneath and decide what to reveal.
- As you reveal or re-cover fog on your screen, the player screen updates **live**. Switching maps in a scene switches the player screen too.
- Slide your mouse onto the player window to **pan (drag), zoom (scroll), and point**: a glowing highlight ring follows the cursor so you can call attention to a spot on the board. A *fit* button re-frames the whole map.

Both windows run entirely on your machine and communicate directly in the browser — nothing is sent over a network.

## Everything stays local

- Maps, fog masks, and thumbnails are stored as blobs in the browser's **IndexedDB** on this machine.
- No network calls, no CDN fonts or icons, no telemetry. The app works offline once it is running.
- Storage is per browser profile: open Fog Atlas in the same browser to see your maps.

## Support

Fog Atlas is free and open. If it earns a place at your table, you can [buy me a coffee on Ko-fi](https://ko-fi.com/thenoxius). ☕

## Credits

The battle maps in the built-in collection are the work of several talented cartographers, generously shared and curated for this app by **u/uchideshi34** on Reddit:

- Dungeon Mapster
- 2-Minute Tabletop (2MTT)
- Gogots
- Crosshead

The same list is available in-app via the **Map credits** link in the library footer. If you're one of these artists (or represent them) and would like this credit changed, expanded, or linked to your page, please open an issue or reach out — happy to update it.

## Development

```bash
npm install
npm run dev      # start at http://localhost:5173
npm run build    # production build in dist/
npm run preview  # serve the production build locally
```

Built with Vite + React + TypeScript. No runtime dependencies beyond React; the canvas, fog compositing (`destination-out` erasing), and IndexedDB layer are hand-rolled.

### The bundled map collection

The DM's original map files live in `assets/` (gitignored — several GB of full-resolution art doesn't fit GitHub or Pages). The repo ships web-optimized copies instead, generated into `public/collection/` (max 3000px WebP + thumbnails + `manifest.json`) by:

```bash
node scripts/build-collection.mjs
```

Re-run it after adding maps to `assets/Battlemaps/<Series>/`; the script is incremental and parses grid dimensions and pixels-per-square from the filenames.

`scripts/scan-metadata.mjs` is a one-off helper that scans `assets/` for embedded EXIF/IPTC/XMP author or copyright fields, in case source files ever carry creator attribution worth surfacing in the [Credits](#credits) modal.

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| `R` / `F` | Reveal / Fog tool |
| `B` | Toggle brush shape: freehand ↔ rectangle |
| `[` / `]` | Smaller / larger brush |
| `G` | Cycle grid overlay: none → hex → square |
| `T` | Text tool (place & edit labels) |
| `K` | Token tool (place & edit icon markers) |
| `N` | Note tool (private, DM-only notes) |
| `Del` | Delete the selected label, token, or note |
| `Space` + drag, right-drag, or middle-drag | Pan |
| Scroll | Zoom at cursor |
| `0` | Fit map to screen |
| `Ctrl+Z` | Undo |
| `Ctrl+S` | Save fog |
