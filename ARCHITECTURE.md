# Ergopad Architecture

## Overview

Ergopad is an ergonomic keyboard layout analyzer. Users tap finger positions on a touchscreen, the app fits trendlines through each finger column via least-squares regression, and renders keycap rectangles aligned to each column's natural reach angle. The eventual goal is Ergogen YAML export for custom keyboard PCB generation.

**Stack:** React 17 + TypeScript 4.2 + Snowpack 3.3 + Tailwind CSS 2 + Two.js (2D rendering) + fp-ts (functional programming)

## Component Tree

```
index.tsx
  Windmill (dark theme provider from @windmill/react-ui)
    default export (async initialization wrapper)
      App ({ storedPpm: Option<number> })
        ColumnSelect ({ column, onChange })
          6x Button (one per finger column)
        ControlPanel (inline)
          Reset Column button
          Reset All button
          PxPerMMControl ({ defaultValue, value, onChange })
            Modal (scale calibration UI)
          Aux Lines toggle button
          Export ({ onRawExport, state: PopupState })
            Dropdown menu
        Boo ({ data, ppm, showAuxiliaryLines })
          useTwo hook (Two.js canvas lifecycle)
```

## Data Flow

```
                    ┌──────────────────────────┐
                    │     Initialization        │
                    │                          │
                    │  localStorage → getFloat  │
                    │       ↓                   │
                    │  IOEither → TaskEither    │
                    │       ↓                   │
                    │  useAsyncEitherData       │
                    │       ↓                   │
                    │  fold: idle/pending/      │
                    │        failed/ready       │
                    │       ↓                   │
                    │  App({ storedPpm })       │
                    └──────────┬───────────────┘
                               │
              ┌────────────────▼────────────────┐
              │         User Input               │
              │                                  │
              │  1. Select column (ColumnSelect) │
              │  2. Tap canvas (pointerdown)     │
              │       ↓                          │
              │  evt.offsetX, evt.offsetY        │
              │       ↓                          │
              │  positions[column].push({x, y})  │
              └────────────────┬────────────────┘
                               │
              ┌────────────────▼────────────────┐
              │       Computation Pipeline       │
              │                                  │
              │  For each column with points:    │
              │    leastSquares(points, invert?)  │
              │       ↓                          │
              │    SlopeInterceptFormLine2D       │
              │    { m: slope, b: intercept }     │
              │       ↓                          │
              │    slopeInterceptFormToStandard   │
              │       ↓                          │
              │    projectPointToLine(line)       │
              │    for each point → projected pt  │
              │       ↓                          │
              │    midpoint = avg of projections  │
              │    angle = PI/2 + atan(slope)     │
              └────────────────┬────────────────┘
                               │
              ┌────────────────▼────────────────┐
              │       Two.js Rendering (Boo)     │
              │                                  │
              │  For each column:                │
              │    - Circles at tapped points    │
              │    - Circles at projected points │
              │    - Perpendicular drop lines    │
              │    - 3 keycap rectangles at      │
              │      midpoint, rotated by angle  │
              │      (17mm keycap spacing)       │
              │                                  │
              │  two.update() → SVG render       │
              └─────────────────────────────────┘
```

## State Management

All state lives in React hooks within the `App` component. No external state library.

| State | Type | Purpose |
|-------|------|---------|
| `column` | `Column` | Currently selected finger column |
| `positions` | `Record<Column, Pos[]>` | All tapped points, grouped by column |
| `showAuxiliaryLines` | `boolean` | Toggle debug visualization (projections, drop lines) |
| `ppm` | `number` | Pixels per millimeter (calibrated scale factor) |
| `exportState` | `PopupState` | Export dropdown open/close |

**Persistence:** Only `ppm` is persisted to localStorage (key: `stored_ppm`). Tapped positions are ephemeral per session.

## Module Dependency Graph

```
index.tsx
  ├── App.tsx (main component)
  │     ├── geometry.ts (point projection, line math)
  │     ├── leastSquares.ts (regression)
  │     │     └── ml-regression-simple-linear (npm)
  │     ├── hooks.ts (useTwo, useBoolState, usePopupState)
  │     │     └── twojs-ts / Two.js (2D rendering)
  │     ├── localStorage.ts (typed storage)
  │     │     ├── fp-ts (IOEither, Option)
  │     │     └── fp-ts-std (floatFromString, stringifyPrimitive)
  │     ├── asyncEitherData.ts (async state machine)
  │     │     ├── asyncData.ts (base async state)
  │     │     └── fp-ts (TaskEither, Either)
  │     └── copy.ts (clipboard)
  ├── @windmill/react-ui (theme + components)
  ├── @heroicons/react (icons)
  └── react-hot-toast (notifications)
```

## Build Pipeline

### Development

```
npm start → Snowpack dev server (localhost:8080)
  - ESM unbundled modules (no webpack/rollup)
  - React Refresh HMR
  - PostCSS → Tailwind JIT
  - TypeScript → JS (Snowpack plugin)
  - .env loaded via @snowpack/plugin-dotenv
```

### Production Build

```
npm run release
  1. snowpack build → build/ (optimized, baseUrl: /ergopad)
  2. rm -rf docs && cp -r build/ docs/
  3. touch docs/.nojekyll
  → docs/ ready for GitHub Pages or static server
```

### Static Server (Tailscale)

```
npm run serve → serve.mjs (Node.js, zero dependencies)
  - Reads .env then .env.local (override)
  - Serves docs/ at HOST:PORT/ergopad/
  - .env.local with ERGOPAD_HOST=0.0.0.0 for Tailscale
  - tailscale serve --bg 3000 exposes on tailnet
```

### CSS Processing Chain

```
src/index.css (@tailwind directives)
  → PostCSS (postcss.config.js)
    → postcss-import (resolve @import)
    → tailwindcss (JIT compilation)
      → tailwind.config.js (windmill preset, purge src/**/*.tsx)
  → Snowpack (serves processed CSS)

src/App.css (custom component styles)
  → PostCSS → Snowpack
```

### Snowpack Mount Configuration

| Source | URL | Purpose |
|--------|-----|---------|
| `public/` | `/` (static) | HTML, favicon, two.min.js, robots.txt |
| `src/` | `/dist/` | Compiled TypeScript → JavaScript |

## Functional Programming Patterns

The codebase uses **fp-ts** extensively for type-safe error handling and composition.

### Composition: `pipe()`
```ts
pipe(value, transform1, transform2, fold(...))
```
Left-to-right function composition. Used throughout for chaining operations.

### Error Handling: `IOEither` / `TaskEither`
- **Sync errors** (localStorage): `IOEither<Error, A>` — a thunk that returns `Either<Error, A>`
- **Async errors** (initialization): `TaskEither<Error, A>` — a thunk that returns `Promise<Either<Error, A>>`
- **Nullable values**: `Option<A>` — `Some(value)` or `None`

### State Machines: `AsyncEitherData<E, A>`
Custom discriminated union for async lifecycle:
```
idle → pending → ready(A) | failed(E)
```
With exhaustive `fold()` for pattern matching all states into React elements.

### Parallel Applicative: `sequenceS`
```ts
pipe(
  { ppm: TE.fromIOEither(getFloat(key)) },
  sequenceS(TE.ApplyPar),
)
```
Lifts an object of independent `TaskEither` values into a single `TaskEither<Error, { ppm: ... }>`.

## Styling Architecture

### Color Scheme (Dark Theme)

| Element | Color |
|---------|-------|
| Background | `#353535` |
| Text | `#ccc` |
| Active state | `rgba(255, 255, 255, 0.3)` |

### Column Colors

| Column | Color | Hex |
|--------|-------|-----|
| thumb | dark gray | `#363636` |
| index_far | blue | `#5454E8` |
| index | muted mauve | `#9C9CB8` |
| middle | dusty rose | `#CF9393` |
| ring | teal | `#59BDBD` |
| pinky | cyan | `#A5FAFA` |

### Layout Structure

```
.app (100vh flex column, dark bg)
  .container (padding, toolbar)
    .columnButtons (flex row, gap: 1rem)
    control buttons (flex row, gap: 0.5rem)
  .touchytouchy (flex-grow, semi-transparent overlay)
    .boo (Two.js SVG canvas, full width)
```

## External Dependencies

| Package | Version | Role |
|---------|---------|------|
| react | 17.0.2 | UI framework |
| twojs-ts | 0.7.0-13 | 2D vector graphics (SVG rendering) |
| fp-ts | 2.10.5 | Functional programming (Option, Either, Task, pipe) |
| fp-ts-std | 0.10.0 | fp-ts standard library extensions |
| monocle-ts | 2.3.10 | Optics / lenses (available, not actively used) |
| newtype-ts | 0.3.4 | Branded types (available, not actively used) |
| ml-regression-simple-linear | 2.0.3 | Least-squares linear regression |
| @windmill/react-ui | 0.6.0 | Accessible component library (Modal, Button, Dropdown) |
| @heroicons/react | 1.0.3 | SVG icons (SaveIcon) |
| react-hot-toast | 2.1.0 | Toast notifications |
| tailwindcss | 2.2.2 | Utility CSS framework |
| snowpack | 3.3.7 | ESM-native build tool |
