# Ergopad Object Reference

Catalog of all concrete objects, instances, and runtime values in the codebase.

## React Components

### `<App>` — Main Application
- **File:** `src/App.tsx:382`
- **Props:** `{ storedPpm: Option<number> }`
- **State:** column, positions, showAuxiliaryLines, ppm, exportState
- **Responsibilities:** Touch event capture, state management, toolbar rendering, delegates canvas to Boo

### `<Boo>` — Canvas Visualization
- **File:** `src/App.tsx:102`
- **Props:** `{ data: Record<Column, Pos[]>, ppm: number, showAuxiliaryLines: boolean }`
- **Responsibilities:** Two.js rendering — tapped points, trendlines, projections, keycap rectangles
- **Two.js objects created per column:**
  - `two.makeCircle()` — tapped point markers (semi-transparent, column color)
  - `two.makeCircle()` — projected point markers (red, small)
  - `two.makeLine()` — perpendicular drop lines (point → projection)
  - `two.makeRectangle()` — 3 keycap outlines (home, top, bottom row)
  - `two.makeGroup()` — groups keycap rectangles for rotation

### `<ColumnSelect>` — Finger Column Selector
- **File:** `src/App.tsx` (inline component)
- **Props:** `{ column: Column, onChange: (c: Column) => void }`
- **Renders:** 6 buttons with color indicators, one per finger column

### `<PxPerMMControl>` — Scale Calibration
- **File:** `src/App.tsx` (inline component)
- **Props:** `{ defaultValue: number, value: number, onChange: (a: number) => void }`
- **Renders:** "Tune Scale" button + Modal dialog with ruler-based calibration input

### `<Export>` — Export Dropdown
- **File:** `src/App.tsx` (inline component)
- **Props:** `{ onRawExport: () => void, state: PopupState }`
- **Renders:** Dropdown with export options (currently: raw JSON clipboard copy)

### Default Export — Initialization Wrapper
- **File:** `src/App.tsx:488`
- **Pattern:** Renders loading/error states, then `<App>` when config is loaded
- **Uses:** `useAsyncEitherData` + `fold` for lifecycle rendering

---

## Two.js Objects (Runtime)

Created dynamically in the `Boo` component's `useTwo` callback:

| Object | API | Purpose |
|--------|-----|---------|
| `Two` instance | `new Two({ width, height })` | Root renderer, appended to `.boo` div |
| Circle (tapped) | `two.makeCircle(x, y, 4)` | Marks where user tapped, column color, 50% opacity |
| Circle (projected) | `two.makeCircle(x, y, 2)` | Marks projected point on trendline, red |
| Line (perpendicular) | `two.makeLine(x1, y1, x2, y2)` | Drop line from tapped to projected point |
| Rectangle (keycap) | `two.makeRectangle(x, y, w, h)` | Keycap outline, 17mm spacing converted via ppm |
| Group | `two.makeGroup(rect1, rect2, rect3)` | Groups 3 keycap rows for rotation |

**Lifecycle:** `two.clear()` wipes all objects, then full re-render on every state change.

---

## State Objects

### `positions` — Tap Data Store
- **Type:** `Record<Column, Pos[]>`
- **Shape:**
  ```ts
  {
    thumb:     [{ x: 120, y: 340 }, ...],
    index_far: [{ x: 200, y: 300 }, ...],
    index:     [{ x: 250, y: 310 }, ...],
    middle:    [{ x: 300, y: 320 }, ...],
    ring:      [{ x: 350, y: 330 }, ...],
    pinky:     [{ x: 400, y: 350 }, ...],
  }
  ```
- **Mutated by:** pointerdown event handler
- **Consumed by:** Boo component, Export handler

### `column` — Active Selection
- **Type:** `Column` (string literal union)
- **Default:** `'middle'`
- **Controls:** Which finger column receives new taps

### `ppm` — Pixels Per Millimeter
- **Type:** `number`
- **Default:** `5` (DEFAULT_PX_PER_MM_VALUE)
- **Persisted:** localStorage key `stored_ppm`
- **Used for:** Converting pixel coordinates to mm for keycap sizing

### `exportState` — Dropdown Controller
- **Type:** `PopupState` (from `usePopupState`)
- **Shape:** `{ isOpen: boolean, open(), close(), toggle() }`

---

## Computed Objects (Per Render)

These are calculated fresh on each render inside `Boo`:

### Trendline
- **Type:** `SlopeInterceptFormLine2D`
- **Source:** `leastSquares(points, shouldInvert)`
- **Shape:** `{ m: -0.42, b: 580.3 }`
- **One per column** with recorded points

### Projections Array
- **Type:** `Point2D[]`
- **Source:** `points.map(projectPointToLine(standardFormLine))`
- **Contains:** Each tapped point projected perpendicularly onto the trendline

### Midpoint
- **Type:** `{ x: number, y: number }`
- **Source:** Average of projected X coordinates, evaluated on trendline
- **Represents:** Center of the finger column (where home row key goes)

### Keycap Group
- **Rotation:** `Math.PI / 2 + Math.atan(trendline.m)`
- **Translation:** Set to midpoint coordinates
- **Children:** 3 rectangles at vertical offsets of 0, +keyWidth, -keyWidth

---

## Configuration Objects

### Snowpack Config (`snowpack.config.mjs`)
```ts
{
  mount: {
    public: { url: '/', static: true },
    src: { url: '/dist' },
  },
  plugins: [
    '@snowpack/plugin-postcss',
    '@snowpack/plugin-react-refresh',
    '@snowpack/plugin-dotenv',
    ['@snowpack/plugin-typescript', { args: '--project tsconfig.json' }],
  ],
  devOptions: { tailwindConfig: './tailwind.config.js' },
  buildOptions: { baseUrl: '/ergopad' },
}
```

### Tailwind Config (`tailwind.config.js`)
```ts
windmill({
  purge: ['./src/**/*.tsx'],
  darkMode: 'media',
  theme: { extends: {} },
  variants: { extend: {} },
  plugins: [],
})
```

### PostCSS Config (`postcss.config.js`)
```ts
{
  plugins: [require('postcss-import'), require('tailwindcss')]
}
```

### TypeScript Config (`tsconfig.json`)
```ts
{
  include: ['src', 'types'],
  compilerOptions: {
    module: 'esnext',
    target: 'esnext',
    jsx: 'preserve',
    strict: true,
    noEmit: true,
  }
}
```

### Windmill Theme Override (`src/index.tsx`)
```ts
{
  button: {
    primary: {
      base: 'text-white bg-purple-600 border border-transparent',
      active: 'active:bg-purple-600 hover:bg-purple-700 focus:ring focus:ring-purple-300',
      disabled: 'opacity-50 cursor-not-allowed',
    }
  }
}
```

---

## Environment Objects

### `.env` (committed defaults)
```
ERGOPAD_HOST=localhost
ERGOPAD_PORT=3000
```

### `.env.local` (gitignored overrides)
```
ERGOPAD_HOST=0.0.0.0
ERGOPAD_PORT=3000
```

### serve.mjs Runtime
```ts
const env = loadEnv();        // Merged .env + .env.local
const HOST = "0.0.0.0";       // From .env.local
const PORT = 3000;             // From .env
const PREFIX = "/ergopad";     // Hardcoded
const DOCS_DIR = "<repo>/docs"; // Resolved from import.meta.dirname
```

### MIME Type Map (serve.mjs)
```ts
{
  '.html': 'text/html',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.json': 'application/json',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
}
```

---

## File Inventory

| File | Lines | Role |
|------|-------|------|
| `src/App.tsx` | ~500 | Main component, UI, rendering |
| `src/index.tsx` | ~15 | Entry point, theme provider |
| `src/geometry.ts` | ~45 | Line math, point projection |
| `src/leastSquares.ts` | ~20 | Linear regression wrapper |
| `src/hooks.ts` | ~80 | useTwo, useBoolState, usePopupState |
| `src/localStorage.ts` | ~50 | Typed localStorage via fp-ts |
| `src/asyncData.ts` | ~35 | AsyncData state machine |
| `src/asyncEitherData.ts` | ~65 | AsyncEitherData state machine |
| `src/copy.ts` | ~25 | Clipboard utility |
| `src/App.test.tsx` | ~10 | Smoke test |
| `src/index.css` | ~10 | Tailwind directives, base fonts |
| `src/App.css` | ~60 | Component layout styles |
| `serve.mjs` | ~77 | Static file server |
| `snowpack.config.mjs` | ~20 | Build configuration |
| `tailwind.config.js` | ~10 | CSS framework config |
| `postcss.config.js` | ~3 | PostCSS plugins |
| `tsconfig.json` | ~20 | TypeScript compiler options |
| `types/static.d.ts` | ~25 | Asset import type declarations |
| `public/index.html` | ~20 | HTML shell |
| `public/two.min.js` | 1 | Two.js library (139KB minified) |
