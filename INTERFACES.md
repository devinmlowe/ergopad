# Ergopad Interfaces & Type Reference

## Core Domain Types

### Finger Columns

```ts
// src/App.tsx
type Column = 'pinky' | 'ring' | 'middle' | 'index' | 'index_far' | 'thumb';

const columns: Column[] = ['thumb', 'index_far', 'index', 'middle', 'ring', 'pinky'];
const defaultColumn: Column = 'middle';
```

Six finger columns representing the keyboard layout zones. `index_far` is the extended reach column for the index finger.

### Positions

```ts
// src/App.tsx (local alias)
type Pos = { x: number; y: number };

// src/geometry.ts (exported)
export type Point2D = { x: number; y: number };
```

Both represent pixel coordinates on the canvas. `Point2D` is the geometry module's version; `Pos` is the App-local alias with identical shape.

### Column Data (App State)

```ts
Record<Column, Pos[]>

// Default:
const defaultPositions: Record<Column, Pos[]> = {
  thumb: [], index_far: [], index: [], middle: [], ring: [], pinky: []
};
```

All recorded tap positions grouped by finger column. This is the primary application state.

---

## Geometry Types (`src/geometry.ts`)

### Line Representations

```ts
export type SlopeInterceptFormLine2D = {
  m: number;  // slope
  b: number;  // y-intercept
};
// Represents: y = mx + b

export type StandardFormLine2D = {
  a: number;  // x coefficient
  b: number;  // y coefficient
  c: number;  // constant
};
// Represents: ax + by + c = 0
```

Two equivalent representations of a 2D line. Slope-intercept form is output by regression; standard form is used for projection and intersection calculations.

### Internal Types

```ts
type Vec2D = Point2D;  // Alias — same structure, vector semantics
```

### Functions

```ts
export const slopeInterceptFormToStandardForm: (
  line: SlopeInterceptFormLine2D
) => StandardFormLine2D
// Converts y = mx + b  →  mx - y + b = 0
// Result: { a: m, b: -1, c: b }

export const projectPointToLine =
  (line: StandardFormLine2D) =>
  (point: Point2D): Point2D
// Curried. Projects a point perpendicularly onto a line.
// Returns the closest point on the line to the input point.

// Internal:
const line2DIntersection: (
  line1: StandardFormLine2D,
  line2: StandardFormLine2D
) => Point2D
// Finds intersection of two lines using Cramer's rule.
```

---

## Regression (`src/leastSquares.ts`)

```ts
export const leastSquares = (
  points: Point2D[],
  shouldUseInvertedRegression?: boolean  // default: false
): SlopeInterceptFormLine2D
```

Fits a straight line through a set of points using least-squares regression.

- **Normal mode:** Fits `y = mx + b` from X→Y
- **Inverted mode:** Fits `x = my + b` from Y→X, then converts back — produces better results for near-vertical columns (e.g., thumb)
- **Library:** `ml-regression-simple-linear` (provides `.slope`, `.intercept`)

---

## Async State Machines

### AsyncData (`src/asyncData.ts`)

```ts
export type AsyncData<A> =
  | { type: 'idle' }
  | { type: 'pending' }
  | { type: 'ready'; data: A };
```

Three-state lifecycle for async operations without error handling.

```ts
export const useAsyncData = <A>(task: T.Task<A>): AsyncData<A>
```

React hook that executes an fp-ts `Task<A>` and tracks its lifecycle state via `useReducer`.

### AsyncEitherData (`src/asyncEitherData.ts`)

```ts
type AsyncEitherData<E, A> =
  | { type: 'idle' }
  | { type: 'pending' }
  | { type: 'failed'; reason: E }
  | { type: 'ready'; data: A };
```

Four-state lifecycle extending `AsyncData` with error handling.

```ts
export const useAsyncEitherData = <E, A>(
  te: TE.TaskEither<E, A>
): AsyncEitherData<E, A>
```

React hook that executes an fp-ts `TaskEither<E, A>` and tracks its lifecycle.

```ts
export const fold = <E, A, B>(
  onIdle:    () => B,
  onPending: () => B,
  onFailed:  (e: E) => B,
  onReady:   (a: A) => B,
) => (aed: AsyncEitherData<E, A>): B
```

Exhaustive pattern match — maps each state to a value of type `B`. Used to render different UI states (loading, error, content).

---

## LocalStorage (`src/localStorage.ts`)

All functions return `IOEither<Error, T>` — a thunk that wraps localStorage calls in try-catch and returns `Either`.

```ts
export const getItem = (key: string): IOEither<Error, Option<string>>
// Right(Some(value)) | Right(None) | Left(Error)

export const setItem = (key: string, value: string): IOEither<Error, void>

export const removeItem = (key: string): IOEither<Error, void>

export const getFloat = (key: string): IOEither<Error, Option<number>>
// Chains: getItem → parse float via fp-ts-std floatFromString
// Right(Some(3.14)) | Right(None) | Left(Error)

export const setPrimitive = (
  key: string,
  p: string | number | boolean | null
): IOEither<Error, void>
// Stringifies primitive via fp-ts-std, then setItem
```

**Constants:**
```ts
const PIX_PER_MM_LOCALSTORAGE_KEY = 'stored_ppm';  // in App.tsx
```

---

## React Hooks (`src/hooks.ts`)

### useBoolState

```ts
type BoolState = {
  value: boolean;
  setTrue(): void;
  setFalse(): void;
  toggle(): void;
};

export const useBoolState = (init: boolean): BoolState
```

Boolean state with memoized convenience methods.

### usePopupState

```ts
export type PopupState = {
  isOpen: boolean;
  open(): void;
  close(): void;
  toggle(): void;
};

export const usePopupState = (init: boolean): PopupState
```

Popup/modal open-close state. Built on `useBoolState`.

### useTwo

```ts
export const useTwo = <T extends HTMLElement>(
  elRef: React.RefObject<T>,
  f: (two: Two, el: T) => void,
  fDeps: React.DependencyList,
) => void
```

Two.js canvas lifecycle hook:
1. On mount: creates `new Two({ width, height })` and appends to DOM element
2. On dependency change: calls `f(two, el)` for rendering
3. On unmount: clears Two.js instance

---

## Clipboard (`src/copy.ts`)

```ts
export const copy = (s: string): Promise<void>
```

Copies text to clipboard. Uses Clipboard API when available, falls back to textarea-based `execCommand('copy')` for older browsers and iOS.

---

## Component Props (`src/App.tsx`)

### App

```ts
export const App = ({ storedPpm }: { storedPpm: O.Option<number> }) => ...
```

Main app component. Receives optional stored pixels-per-mm from localStorage.

### ColumnSelect

```ts
{ column: Column; onChange: (c: Column) => void }
```

Row of 6 buttons for selecting the active finger column.

### Boo (Canvas)

```ts
{
  data: Record<Column, Pos[]>;
  ppm: number;
  showAuxiliaryLines: boolean;
}
```

Two.js visualization component. Renders points, trendlines, projections, and keycap rectangles for all columns.

### PxPerMMControl

```ts
{
  defaultValue: number;
  value: number;
  onChange: (a: number) => void;
}
```

Scale calibration control with modal dialog. `defaultValue` is the fallback when no stored value exists.

### Export

```ts
{
  onRawExport: () => void;
  state: PopupState;
}
```

Export dropdown with raw JSON clipboard copy action.

### Default Export (Root)

```ts
export default () => React.ReactElement
```

Initialization wrapper that:
1. Runs `setup()` to load config from localStorage via `TaskEither`
2. Pattern-matches lifecycle with `AED.fold(idle, pending, failed, ready)`
3. Renders `<App>` in the `ready` state

---

## Constants (`src/App.tsx`)

```ts
const defaultMMPer300px = 100;
const DEFAULT_PX_PER_MM_VALUE = 5;        // 5 px/mm fallback
const PIX_PER_MM_LOCALSTORAGE_KEY = 'stored_ppm';
```

### Column-to-Color Mapping

```ts
const columnToColor = (c: Column): string => ({
  thumb:     '#363636',
  index_far: '#5454E8',
  index:     '#9C9CB8',
  middle:    '#CF9393',
  ring:      '#59BDBD',
  pinky:     '#A5FAFA',
}[c]);
```

### Keycap Rendering

- **Key width:** 17mm (PG1316S 16mm keycap + 1mm gap)
- **Rotation formula:** `group.rotation = Math.PI / 2 + Math.atan(trendline.m)`
- **Row offsets:** 3 rectangles drawn at midpoint (home), midpoint - keyWidth (top), midpoint + keyWidth (bottom)

---

## fp-ts Types Used

| Type | Import | Semantics |
|------|--------|-----------|
| `Option<A>` | `fp-ts/lib/Option` | `Some(A)` or `None` — nullable value |
| `Either<E, A>` | `fp-ts/lib/Either` | `Left(E)` or `Right(A)` — result or error |
| `IO<A>` | `fp-ts/lib/IO` | `() => A` — lazy side effect |
| `IOEither<E, A>` | `fp-ts/lib/IOEither` | `() => Either<E, A>` — sync failable effect |
| `Task<A>` | `fp-ts/lib/Task` | `() => Promise<A>` — async effect |
| `TaskEither<E, A>` | `fp-ts/lib/TaskEither` | `() => Promise<Either<E, A>>` — async failable effect |
| `pipe` | `fp-ts/lib/function` | Left-to-right composition |
| `sequenceS` | `fp-ts/lib/Apply` | Lift `{ key: F<A> }` → `F<{ key: A }>` |

## fp-ts-std Extensions

| Function | Import | Purpose |
|----------|--------|---------|
| `floatFromString` | `fp-ts-std/Number` | `string → Option<number>` |
| `stringifyPrimitive` | `fp-ts-std/JSON` | `primitive → string` |

---

## Type Declaration (`types/static.d.ts`)

```ts
declare module '*.svg' {
  const ref: string;
  export default ref;
}
declare module '*.bmp' { ... }
declare module '*.gif' { ... }
declare module '*.jpg' { ... }
declare module '*.jpeg' { ... }
declare module '*.png' { ... }
declare module '*.webp' { ... }
declare module '*.module.css' {
  const classes: { readonly [key: string]: string };
  export default classes;
}
declare module '*.module.sass' { ... }
declare module '*.module.scss' { ... }
declare module '*.css';
```

Ambient type declarations for static asset imports. Allows TypeScript to understand `import logo from './logo.svg'` and CSS module imports.

---

## Module Export Surface

| Module | Exports |
|--------|---------|
| `asyncData.ts` | `AsyncData<A>`, `useAsyncData` |
| `asyncEitherData.ts` | `AsyncEitherData<E,A>`, `useAsyncEitherData`, `fold` |
| `geometry.ts` | `Point2D`, `StandardFormLine2D`, `SlopeInterceptFormLine2D`, `projectPointToLine`, `slopeInterceptFormToStandardForm` |
| `leastSquares.ts` | `leastSquares` |
| `localStorage.ts` | `getItem`, `setItem`, `removeItem`, `getFloat`, `setPrimitive` |
| `copy.ts` | `copy` |
| `hooks.ts` | `BoolState`, `PopupState`, `useBoolState`, `usePopupState`, `useTwo` |
| `App.tsx` | `App` (named), default (initialization wrapper) |
| `index.tsx` | — (entry point, no exports) |
