# CLAUDE.md - Ergopad Fork

**Fork of:** [pashutk/ergopad](https://github.com/pashutk/ergopad)
**Purpose:** Extend Ergopad into a locally-hosted tool that captures hand geometry and exports Ergogen-compatible layout data for the [keyboard-project](../keyboard-project/).

## Project Context

This fork supports the Travel Split Keyboard project's layout workflow (see `keyboard-project/LAYOUT-WORKFLOW.md` Phase 1-2). The upstream Ergopad app captures finger positions on a touchscreen but has no export capability beyond raw JSON clipboard copy. We need it to produce structured output that feeds directly into Ergogen YAML configuration.

## Current State (Upstream)

- **Stack:** React 17, TypeScript, Snowpack, Tailwind CSS 2, Two.js (2D rendering)
- **FP style:** Heavy use of `fp-ts` (Option, Either, TaskEither, IOEither, pipe)
- **Columns:** pinky, ring, middle, index, index_far, thumb (6 per hand)
- **Data model:** `Record<Column, Pos[]>` where `Pos = { x: number; y: number }` — raw pixel coordinates
- **Rendering:** Two.js draws tapped points, least-squares trendlines per column, and keycap rectangles (17mm key width at calibrated px/mm scale)
- **Export:** Raw JSON copy to clipboard only (Ergogen export is commented out / stubbed)
- **No server** — static SPA hosted on GitHub Pages

## Goals

### Phase 1: Local Server + Ergogen Export (MVP)

Make Ergopad run locally and output Ergogen-compatible data.

**1a. Local development server**
- Get `npm start` (Snowpack dev server) working reliably on localhost
- Remove the GitHub Pages `baseUrl: '/ergopad'` assumption for local use
- Verify touch and mouse input both work in local browser

**1b. Extract column geometry from captured points**
- For each column, compute from the existing trendline + projections:
  - **x, y** — center position of the column (midpoint of projected points), in mm
  - **rotation** — column angle from vertical, in degrees (derived from trendline slope: `Math.atan(slope)`)
- Convert pixel coordinates to mm using the existing px/mm calibration (`ppm` state)
- Normalize positions relative to a chosen origin (e.g., home row of middle finger column = 0,0)

**1c. Generate Ergogen YAML output**
- Map the 6 captured columns to Ergogen zone definitions
- Output a YAML snippet with:
  - `stagger` (vertical offset between adjacent columns, in mm)
  - `spread` (horizontal distance between adjacent columns, in mm)
  - `splay` (rotation difference between adjacent columns, in degrees)
  - Per-column `shift: [x, y]` if needed for thumb cluster
  - Per-column `rotate` for column angle
- Use our keyboard project's custom units: `kx: 17`, `ky: 17` (PG1316S 16mm keycaps + 1mm gap)
- Present the YAML in a copyable text area and/or download as `.yaml` file

**Phase 1 output:** User taps finger positions on tablet, app computes column positions + rotations, exports an Ergogen-compatible YAML snippet ready to paste into a `config.yaml`.

### Phase 2 (Future): Enhanced Capture

- Multi-hand capture (left + right with mirroring)
- Per-row capture (separate bottom/home/top row positions instead of trendline inference)
- Save/load sessions (localStorage or file-based)
- Direct Ergogen preview (render the generated layout inline)
- Row spread/stagger tuning UI

### Phase 3 (Future): Full Integration

- WebSocket or REST API for programmatic access from other tools
- Direct Ergogen CLI invocation from the server
- Side-by-side comparison of multiple hand captures
- Import existing Ergogen configs for overlay/comparison

## Architecture Notes

### Key Files

| File | Purpose |
|---|---|
| `src/App.tsx` | Main component — touch capture, column selection, rendering, export |
| `src/geometry.ts` | Point projection, line intersection, coordinate transforms |
| `src/leastSquares.ts` | Linear regression for column trendlines (uses `ml-regression-simple-linear`) |
| `src/hooks.ts` | `useTwo` (Two.js integration), `useBoolState`, `usePopupState` |
| `src/localStorage.ts` | Typed localStorage access via fp-ts IOEither |
| `src/copy.ts` | Clipboard copy utility |
| `snowpack.config.mjs` | Build config — note `baseUrl: '/ergopad'` for GitHub Pages |
| `public/two.min.js` | Two.js library (loaded as script tag, not bundled) |

### Data Flow

```
Touch event (px coords)
  → positions state: Record<Column, Pos[]>
  → leastSquares() computes trendline per column (slope + intercept)
  → projectPointToLine() finds projected positions on trendline
  → Boo component renders: points, trendlines, keycap rectangles via Two.js
```

The trendline slope already encodes column rotation. The midpoint of projected positions gives column center. These are the values Phase 1b needs to extract.

### Column Rotation Math

The existing code computes rotation for keycap rendering at `App.tsx:222`:
```ts
group.rotation = Math.PI / 2 + Math.atan(trendline.m);
```
This gives rotation from vertical. For Ergogen `splay` we need the angle between adjacent columns, which is the difference of their rotations.

## Development

```sh
cd ~/Documents/git/ergopad
npm install
npm start        # Snowpack dev server on localhost:8080
npm test         # Web Test Runner
npm run format   # Prettier
```

## Conventions

- Follow existing fp-ts patterns for new logic (pipe, Option, Either)
- Keep Two.js rendering in the `Boo` component or similar render-only components
- All coordinate math goes in `geometry.ts`
- New export logic should be a separate module (e.g., `src/ergogen.ts`)
- Pixel-to-mm conversion should use the calibrated `ppm` (pixels per mm) value throughout
