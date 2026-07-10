# Fog Atlas — DM Map Manager

A fully local fog-of-war map tool for dungeon masters. Import your campaign maps, prepare which areas the party has explored, and take the exact fog state with you to the session — no accounts, no servers, no cloud.

**▶ Try it: [thenoxius.github.io/fog-atlas](https://thenoxius.github.io/fog-atlas/)** — runs entirely in your browser; your maps never leave your device.

> **Why this is safe for your table:** Fog Atlas has no backend, no account, and no analytics — there is nothing to sign up for and nothing being tracked. Your campaign maps, fog state, and DM notes are stored only in your own browser's local storage (IndexedDB) and are never uploaded anywhere. Open the page, do your prep, close the tab; it's still there next time, on this device only. You can even use it fully offline once it's loaded. If you ever want to double-check, the entire source is open — see [Development](#development) — and the [License](#license) section covers what that means for reuse.

## Quick start

**Just want to use it?** → **[thenoxius.github.io/fog-atlas](https://thenoxius.github.io/fog-atlas/)** — nothing to install, it runs entirely in your browser.

**Want to run it locally?**

```bash
git clone https://github.com/Thenoxius/fog-atlas.git
cd fog-atlas
npm install
npm run dev
```

Opens at `http://localhost:5173`. No accounts, no API keys, no backend to configure. That's the whole setup — the bundled map collection is optional and fetched separately; see [Development](#development) for that and the full command list (build, preview, lint).

## Contents

- [Features](#features)
- [How it works](#how-it-works)
- [The two-screen setup (laptop + TV)](#the-two-screen-setup-laptop--tv)
- [Everything stays local](#everything-stays-local)
- [Support](#support)
- [Credits](#credits)
- [Development](#development)
- [License](#license)
- [Keyboard shortcuts](#keyboard-shortcuts)

## Features

- **Fog of war** you paint and erase with the mouse, autosaved per map and restored exactly when you reopen it.
- **Two-screen play** — a DM screen on your laptop and a live player screen on the TV; reveal on one, players see it on the other.
- **Hex or square grid** overlay with adjustable size, alignment, line thickness, and visibility.
- **Text labels** in several fantasy fonts — name regions and rooms; they reveal with the fog on the player screen.
- **Icon tokens** (campfire, skull, boss, treasure, and more) in a customizable color — mark campsites, dangers, and points of interest.
- **Multi-map scenes** — link maps (e.g. a building and its upper floor), each with its own fog.
- **Bundled map collection** — hundreds of battle maps ready to use, plus your own uploads.
- **Rectangle reveal** — drag a shape to reveal or fog a whole room at once, instead of only brushing it in.
- **Initiative tracker** — add combatants by hand or from your roster, auto-sorted by initiative, with a synced turn-order bar on the player screen. Roster enemies auto-number (Goblin #1, #2…), rows show portraits, and each row expands to a DM-only stat block and condition tracker.
- **DM notes** — pin private notes anywhere on the map for your own reference; they never sync to the player screen, not even hidden under fog.
- **Character roster** — a reusable library of player characters and enemy types with portraits and optional DM-only stat blocks (AC, HP, ability scores, freeform notes), managed from the **Characters** button in the library and loaded straight into the initiative tracker.
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
8. **Initiative tracker**: click **Initiative** in the toolbar to open the panel. Add combatants by hand with a name and initiative score, or click **From roster** to drop in a saved character — pick one and it's added at initiative 0 with its portrait, the roll field focused so you can type the roll straight away. Roster enemies auto-number as you add them (Goblin #1, Goblin #2…), derived from the current encounter so the count resets when you clear it; a roster enemy with a saved max HP starts at full. Combatants are auto-sorted highest first, and **Next Turn** advances through the order and counts rounds. Expand any row (click its portrait/chevron) for a DM-only detail card: the linked character's stat block (AC, HP, speed, ability scores with modifiers, notes) and a condition tracker with one-tap buttons for the common conditions plus a free-text field; active conditions also show as small badges on the collapsed row. HP, stats, and conditions are all for your reference only — they're never sent to the player screen. The encounter is global (not tied to one map), survives page reloads, and its turn order streams live to the player screen as a compact bar with the current turn highlighted — just names and portraits, no HP (the portrait image is read from your local storage on the player side, never sent over the link).
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
- If the TV lies flat as the table itself, with players on both sides: the player window's toolbar can duplicate the initiative bar at the bottom of the screen and flip either copy 180° independently, so each side reads it right-side up. These are per-device display preferences (remembered on that TV/browser), not synced from the DM screen.

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
npm run collection:fetch  # optional — pulls the bundled map collection in (see below)
npm run dev      # start at http://localhost:5173
npm run build    # production build in dist/
npm run preview  # serve the production build locally
npm run lint     # oxlint
```

Built with Vite + React + TypeScript. No runtime dependencies beyond React; the canvas, fog compositing (`destination-out` erasing), and IndexedDB layer are hand-rolled.

Contributions are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md) for local setup and ground rules.

### The bundled map collection

The map images that ship in the Map Collection modal live in a separate repo, [fog-atlas-collection](https://github.com/Thenoxius/fog-atlas-collection), not in this one — this keeps this repo's clone small and lets the collection be updated independently of app releases.

- `npm run collection:fetch` pulls the latest `collection/` folder from that repo into `public/collection/` for local dev. It's optional: without it, the app still runs fine, just with an empty Map Collection.
- The GitHub Actions deploy workflow does the same automatically before every build.
- To add, update, or regenerate maps (including the original-asset pipeline and the EXIF/IPTC metadata scanner), see that repo's own README.

## License

The Fog Atlas source code is [MIT licensed](LICENSE). The bundled battle maps (fetched from the separate [fog-atlas-collection](https://github.com/Thenoxius/fog-atlas-collection) repo into `public/collection/`) are the work of other artists and are **not** covered by that license — see [Credits](#credits).

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
