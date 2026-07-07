# Contributing to Fog Atlas

Thanks for considering it! Fog Atlas is a small, hand-rolled tool (Vite + React + TypeScript, no UI framework), so the codebase should be easy to get around in.

## Local setup

```bash
git clone https://github.com/Thenoxius/fog-atlas.git
cd fog-atlas
npm install
npm run collection:fetch   # optional — pulls in the bundled battle maps
npm run dev      # http://localhost:5173
```

No accounts, API keys, or backend to configure — everything runs and stores data in your browser. `collection:fetch` is optional: skip it and the app runs fine, just with an empty Map Collection modal (everything else — fog, grid, labels, tokens, notes, initiative — works the same either way).

Before opening a PR:

```bash
npm run lint         # oxlint
npx tsc -b           # typecheck
npm run build        # production build
```

## Where things live

- `src/MapEditor.tsx` — the DM screen: fog painting, grid, labels, tokens, notes, initiative, scenes.
- `src/PlayerView.tsx` — the player screen, driven by `BroadcastChannel` messages from the DM screen.
- `src/present.ts` — the message protocol between the two screens.
- `src/db.ts` — the IndexedDB persistence layer.
- `src/grid.ts`, `src/labels.ts`, `src/tokens.ts`, `src/notes.ts` — canvas drawing/hit-testing for each overlay type.

## Ground rules for contributions

- **Keep it local-first.** No telemetry, no accounts, no network calls beyond loading the app itself. This is the whole point of the project.
- **No CDNs.** Fonts and icons are bundled (`@fontsource`, inline SVG, or system emoji) so the app keeps working offline.
- **DM-only data must have no code path to the player screen.** Notes and combatant HP are the existing examples — don't just hide them under fog, don't give them a wire message at all.
- Keep PRs focused. Small, single-purpose changes are much easier to review than drive-by refactors bundled with a feature.

## Reporting bugs / requesting features

Open an issue — there are templates for bug reports and map-collection requests. Screenshots or a short screen recording help a lot for anything UI-related.

## Adding to the bundled map collection

The map images live in a separate repo, [fog-atlas-collection](https://github.com/Thenoxius/fog-atlas-collection), not here. If you're a cartographer and want your maps included (or want existing credits corrected), please open an issue rather than a PR — there are licensing questions to sort out first. See the [Credits](README.md#credits) section of the README for the current state of that.
