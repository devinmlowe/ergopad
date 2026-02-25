# Ergogen Export Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Extract per-column (x, y, rotation) from tapped positions, display live in the UI, and export as Ergogen YAML.

**Architecture:** New pure-function module `src/ergogen.ts` with `computeColumnGeometry()` and `toErgogenYAML()`. App calls the geometry function once per render; result feeds the live panel, the Boo canvas, and the export button. The Column type moves to a shared location so both App and ergogen can import it.

**Tech Stack:** TypeScript, React 17, fp-ts, Mocha/Chai (via @web/test-runner), Two.js, Tailwind CSS 2, @windmill/react-ui

**Design doc:** `docs/plans/2026-02-24-ergogen-export-design.md`

---

## Codebase Context

**Test runner:** `npm test` runs `web-test-runner "src/**/*.test.tsx"`. Tests use Mocha (`describe`/`it`) + Chai (`expect`). Test files live next to source: `src/foo.test.tsx`.

**Key existing files:**
- `src/geometry.ts` — exports `Point2D`, `SlopeInterceptFormLine2D`, `StandardFormLine2D`, `projectPointToLine`, `slopeInterceptFormToStandardForm`
- `src/leastSquares.ts` — exports `leastSquares(points, shouldInvert)`
- `src/App.tsx:43-54` — defines `Column` type, `columns` array, `defaultColumn`
- `src/App.tsx:100` — defines `Pos = { x: number; y: number }`
- `src/App.tsx:102-234` — `Boo` component with inline geometry math (lines 125-222)
- `src/App.tsx:339-380` — `Export` component with commented-out Ergogen option at lines 365-373
- `src/App.tsx:382-486` — `App` component with state and event handling
- `src/copy.ts` — `copy(s: string): Promise<void>`

**Column order in the codebase:**
```ts
const columns: Column[] = ['thumb', 'index_far', 'index', 'middle', 'ring', 'pinky'];
```

**Ergogen column order** (left-to-right on keyboard): `pinky`, `ring`, `middle`, `index`, `inner` (= index_far). Thumb is a separate zone. The YAML formatter must map ergopad column names to Ergogen names.

---

## Task 1: Extract Column type to shared module

**Files:**
- Create: `src/columns.ts`
- Modify: `src/App.tsx:43-54` — remove Column definition, import from columns.ts
- Test: N/A (type-only extraction, verified by TypeScript compiler)

This task is a prerequisite for Task 2 — `ergogen.ts` needs the `Column` type without importing from `App.tsx`.

### Step 1: Create `src/columns.ts`

```ts
export type Column = 'pinky' | 'ring' | 'middle' | 'index' | 'index_far' | 'thumb';

export const columns: Column[] = [
  'thumb',
  'index_far',
  'index',
  'middle',
  'ring',
  'pinky',
];
```

### Step 2: Update `src/App.tsx` imports

Remove lines 43-54 (the `Column` type, `defaultColumn`, `columns` array, and `columnToColor`). Replace with:

```ts
import { Column, columns } from './columns';
```

Keep `defaultColumn` and `columnToColor` in App.tsx since they're UI-only concerns. Only move `Column` and `columns`.

### Step 3: Verify TypeScript compiles

Run: `npx tsc --noEmit`
Expected: No errors. All existing references to `Column` and `columns` in App.tsx still resolve.

### Step 4: Commit

```bash
git add src/columns.ts src/App.tsx
git commit -m "refactor: extract Column type to shared module"
```

**Touches:** `src/columns.ts` (new), `src/App.tsx`

---

## Task 2: Create `computeColumnGeometry()` with tests

**Files:**
- Create: `src/ergogen.ts`
- Create: `src/ergogen.test.tsx`
- Test: `src/ergogen.test.tsx`

This is the core pure function. No React dependency. Depends on `geometry.ts`, `leastSquares.ts`, and `columns.ts`.

### Step 1: Write the failing test

Create `src/ergogen.test.tsx`:

```tsx
import { expect } from 'chai';
import type { Point2D } from './geometry';
import type { Column } from './columns';
import { computeColumnGeometry } from './ergogen';
import type { ColumnGeometry } from './ergogen';

// Helper: create positions record with only specified columns populated
const emptyPositions = (): Record<Column, Point2D[]> => ({
  thumb: [],
  index_far: [],
  index: [],
  middle: [],
  ring: [],
  pinky: [],
});

describe('computeColumnGeometry', () => {
  it('returns null for columns with fewer than 2 points', () => {
    const positions = emptyPositions();
    positions.middle = [{ x: 100, y: 200 }]; // only 1 point
    const result = computeColumnGeometry(positions, 5);
    expect(result.middle).to.equal(null);
    expect(result.pinky).to.equal(null);
  });

  it('computes geometry for a column with vertical points', () => {
    const positions = emptyPositions();
    // 3 points roughly vertical at x=250, y varies 100-300
    // ppm=5 means 1mm = 5px
    positions.middle = [
      { x: 250, y: 100 },
      { x: 250, y: 200 },
      { x: 250, y: 300 },
    ];
    const result = computeColumnGeometry(positions, 5);
    const mid = result.middle;
    expect(mid).to.not.equal(null);
    if (mid === null) return;
    // Middle is origin, so x_mm and y_mm should be 0
    expect(mid.x_mm).to.equal(0);
    expect(mid.y_mm).to.equal(0);
    // Perfectly vertical points → rotation ~0 degrees from vertical
    expect(Math.abs(mid.rotation_deg)).to.be.lessThan(1);
  });

  it('normalizes positions relative to middle column', () => {
    const positions = emptyPositions();
    // Middle at pixel (250, 200), ring at pixel (150, 200)
    // ppm = 5 → middle at (50mm, 40mm), ring at (30mm, 40mm)
    // After normalization: middle = (0, 0), ring = (-20, 0)
    positions.middle = [
      { x: 250, y: 150 },
      { x: 250, y: 250 },
    ];
    positions.ring = [
      { x: 150, y: 150 },
      { x: 150, y: 250 },
    ];
    const result = computeColumnGeometry(positions, 5);
    const mid = result.middle!;
    const ring = result.ring!;
    expect(mid.x_mm).to.equal(0);
    expect(mid.y_mm).to.equal(0);
    // Ring should be to the left (negative x) of middle
    expect(ring.x_mm).to.be.lessThan(0);
    // Same y → ring.y_mm should be ~0
    expect(Math.abs(ring.y_mm)).to.be.lessThan(1);
  });

  it('returns all null when middle has no points (no origin)', () => {
    const positions = emptyPositions();
    positions.ring = [
      { x: 100, y: 100 },
      { x: 100, y: 200 },
    ];
    const result = computeColumnGeometry(positions, 5);
    // Without middle to normalize against, all should be null
    expect(result.ring).to.equal(null);
  });
});
```

### Step 2: Run test to verify it fails

Run: `npm test -- --files "src/ergogen.test.tsx"`
Expected: FAIL — `Cannot find module './ergogen'`

### Step 3: Write `src/ergogen.ts` with `computeColumnGeometry`

```ts
import type { Point2D } from './geometry';
import {
  projectPointToLine,
  slopeInterceptFormToStandardForm,
} from './geometry';
import { leastSquares } from './leastSquares';
import type { Column } from './columns';

export type ColumnGeometry = {
  x_mm: number;
  y_mm: number;
  rotation_deg: number;
};

type RawColumnGeometry = {
  x_px: number;
  y_px: number;
  rotation_deg: number;
};

/**
 * Compute raw (pixel-based) geometry for a single column.
 * Returns null if fewer than 2 points.
 */
const computeSingleColumn = (
  points: Point2D[],
  column: Column,
): RawColumnGeometry | null => {
  if (points.length < 2) return null;

  const trendline = leastSquares(points, column !== 'thumb');
  const projections = points.map(
    projectPointToLine(slopeInterceptFormToStandardForm(trendline)),
  );

  const xs = projections.map(({ x }) => x);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const averageX = (maxX - minX) / 2 + minX;

  return {
    x_px: averageX,
    y_px: trendline.m * averageX + trendline.b,
    rotation_deg: (Math.PI / 2 + Math.atan(trendline.m)) * (180 / Math.PI),
  };
};

/**
 * Compute column geometry for all columns.
 * Returns mm coordinates normalized so middle column home = (0, 0).
 * If middle column has < 2 points, all columns return null (no origin).
 */
export const computeColumnGeometry = (
  positions: Record<Column, Point2D[]>,
  ppm: number,
): Record<Column, ColumnGeometry | null> => {
  // Compute raw pixel geometry for each column
  const raw: Record<Column, RawColumnGeometry | null> = {
    thumb: computeSingleColumn(positions.thumb, 'thumb'),
    index_far: computeSingleColumn(positions.index_far, 'index_far'),
    index: computeSingleColumn(positions.index, 'index'),
    middle: computeSingleColumn(positions.middle, 'middle'),
    ring: computeSingleColumn(positions.ring, 'ring'),
    pinky: computeSingleColumn(positions.pinky, 'pinky'),
  };

  // Need middle as origin
  const origin = raw.middle;
  if (origin === null) {
    return {
      thumb: null,
      index_far: null,
      index: null,
      middle: null,
      ring: null,
      pinky: null,
    };
  }

  const toMm = (r: RawColumnGeometry): ColumnGeometry => ({
    x_mm: (r.x_px - origin.x_px) / ppm,
    y_mm: (r.y_px - origin.y_px) / ppm,
    rotation_deg: r.rotation_deg,
  });

  const result = {} as Record<Column, ColumnGeometry | null>;
  for (const col of Object.keys(raw) as Column[]) {
    const r = raw[col];
    result[col] = r === null ? null : toMm(r);
  }
  return result;
};
```

### Step 4: Run tests to verify they pass

Run: `npm test -- --files "src/ergogen.test.tsx"`
Expected: All 4 tests PASS

### Step 5: Commit

```bash
git add src/ergogen.ts src/ergogen.test.tsx
git commit -m "feat: add computeColumnGeometry with tests"
```

**Touches:** `src/ergogen.ts` (new), `src/ergogen.test.tsx` (new)

---

## Task 3: Create `toErgogenYAML()` with tests

**Files:**
- Modify: `src/ergogen.ts` — add `toErgogenYAML` function
- Modify: `src/ergogen.test.tsx` — add YAML formatter tests

Depends on Task 2 (uses `ColumnGeometry` type).

### Step 1: Write the failing test

Append to `src/ergogen.test.tsx`:

```tsx
import { toErgogenYAML } from './ergogen';

describe('toErgogenYAML', () => {
  it('produces valid YAML with stagger/spread/splay for populated columns', () => {
    const geometry: Record<Column, ColumnGeometry | null> = {
      pinky:     { x_mm: -34.0, y_mm: -6.0, rotation_deg: 5.0 },
      ring:      { x_mm: -17.0, y_mm:  2.0, rotation_deg: 2.0 },
      middle:    { x_mm:   0.0, y_mm:  0.0, rotation_deg: 0.0 },
      index:     { x_mm:  17.0, y_mm: -3.0, rotation_deg: -1.0 },
      index_far: { x_mm:  34.0, y_mm: -6.0, rotation_deg: -2.0 },
      thumb:     { x_mm:  22.0, y_mm: -28.0, rotation_deg: 18.0 },
    };
    const yaml = toErgogenYAML(geometry);
    // Should contain units
    expect(yaml).to.include('kx: 17');
    expect(yaml).to.include('ky: 17');
    // Should contain matrix zone columns
    expect(yaml).to.include('pinky:');
    expect(yaml).to.include('ring:');
    expect(yaml).to.include('middle:');
    expect(yaml).to.include('index:');
    expect(yaml).to.include('inner:');
    // Should contain thumb zone
    expect(yaml).to.include('thumb:');
    // Should contain stagger/splay values
    expect(yaml).to.include('stagger:');
    expect(yaml).to.include('splay:');
  });

  it('skips columns with null geometry', () => {
    const geometry: Record<Column, ColumnGeometry | null> = {
      pinky: null,
      ring: null,
      middle:    { x_mm: 0, y_mm: 0, rotation_deg: 0 },
      index:     { x_mm: 17, y_mm: -3, rotation_deg: -1 },
      index_far: null,
      thumb: null,
    };
    const yaml = toErgogenYAML(geometry);
    // Should still produce valid YAML with available columns
    expect(yaml).to.include('middle:');
    expect(yaml).to.include('index:');
    // Should not include columns with no data
    expect(yaml).to.not.include('pinky:');
    expect(yaml).to.not.include('inner:');
  });
});
```

### Step 2: Run test to verify it fails

Run: `npm test -- --files "src/ergogen.test.tsx"`
Expected: FAIL — `toErgogenYAML is not exported`

### Step 3: Implement `toErgogenYAML` in `src/ergogen.ts`

Append to `src/ergogen.ts`:

```ts
/**
 * Ergogen column order (left to right on keyboard).
 * Maps ergopad column names to Ergogen zone names.
 */
const ergogenMatrixColumns: { ergopad: Column; ergogen: string }[] = [
  { ergopad: 'pinky', ergogen: 'pinky' },
  { ergopad: 'ring', ergogen: 'ring' },
  { ergopad: 'middle', ergogen: 'middle' },
  { ergopad: 'index', ergogen: 'index' },
  { ergopad: 'index_far', ergogen: 'inner' },
];

const round1 = (n: number): number => Math.round(n * 10) / 10;

/**
 * Generate an Ergogen-compatible YAML snippet from column geometry.
 * Computes stagger (y offset), spread (x offset), and splay (rotation delta)
 * between adjacent columns.
 */
export const toErgogenYAML = (
  geometry: Record<Column, ColumnGeometry | null>,
): string => {
  const lines: string[] = [];
  lines.push('units:');
  lines.push('  kx: 17');
  lines.push('  ky: 17');
  lines.push('');
  lines.push('points:');
  lines.push('  zones:');
  lines.push('    matrix:');
  lines.push('      columns:');

  let prevCol: ColumnGeometry | null = null;
  let hasMatrixColumns = false;

  for (const { ergopad, ergogen } of ergogenMatrixColumns) {
    const col = geometry[ergopad];
    if (col === null) {
      prevCol = null;
      continue;
    }

    hasMatrixColumns = true;
    lines.push(`        ${ergogen}:`);
    lines.push(`          key:`);

    if (prevCol !== null) {
      const stagger = round1(col.y_mm - prevCol.y_mm);
      const spread = round1(col.x_mm - prevCol.x_mm);
      const splay = round1(col.rotation_deg - prevCol.rotation_deg);
      lines.push(`            stagger: ${stagger}`);
      lines.push(`            spread: ${spread}`);
      lines.push(`            splay: ${splay}`);
    } else {
      // First column — absolute stagger from origin, no spread
      lines.push(`            stagger: ${round1(col.y_mm)}`);
      if (col.rotation_deg !== 0) {
        lines.push(`            splay: ${round1(col.rotation_deg)}`);
      }
    }

    prevCol = col;
  }

  // Thumb zone
  const thumb = geometry.thumb;
  if (thumb !== null) {
    lines.push('');
    lines.push('    thumb:');
    lines.push('      anchor:');
    lines.push('        ref: matrix_inner_bottom');
    // Thumb shift is relative to inner column (index_far)
    const inner = geometry.index_far;
    if (inner !== null) {
      const shiftX = round1(thumb.x_mm - inner.x_mm);
      const shiftY = round1(thumb.y_mm - inner.y_mm);
      lines.push(`        shift: [${shiftX}, ${shiftY}]`);
    } else {
      lines.push(`        shift: [${round1(thumb.x_mm)}, ${round1(thumb.y_mm)}]`);
    }
    lines.push('      columns:');
    lines.push('        thumb:');
    lines.push('          key:');
    lines.push(`            splay: ${round1(thumb.rotation_deg)}`);
  }

  lines.push('');
  return lines.join('\n');
};
```

### Step 4: Run tests to verify they pass

Run: `npm test -- --files "src/ergogen.test.tsx"`
Expected: All 6 tests PASS (4 from Task 2 + 2 new)

### Step 5: Commit

```bash
git add src/ergogen.ts src/ergogen.test.tsx
git commit -m "feat: add toErgogenYAML formatter with tests"
```

**Touches:** `src/ergogen.ts`, `src/ergogen.test.tsx`

---

## Task 4: Refactor Boo to use shared geometry computation

**Files:**
- Modify: `src/App.tsx:102-234` — Boo component
- Modify: `src/App.tsx:382-486` — App component (call computeColumnGeometry, pass to Boo)

Depends on Task 1 (Column import) and Task 2 (computeColumnGeometry).

### Step 1: Import ergogen module in App.tsx

Add to imports at top of `src/App.tsx`:

```ts
import { computeColumnGeometry } from './ergogen';
import type { ColumnGeometry } from './ergogen';
```

### Step 2: Compute geometry in App component

In the `App` component (after line 391 where `ppm` state is initialized), add:

```ts
const geometry = computeColumnGeometry(positions, ppm);
```

This is a pure function call — it recomputes on every render when positions or ppm change.

### Step 3: Update Boo props

Change Boo's prop type from:

```ts
const Boo = ({
  data,
  ppm,
  showAuxiliaryLines,
}: {
  data: Record<Column, Pos[]>;
  ppm: number;
  showAuxiliaryLines: boolean;
}) => {
```

To:

```ts
const Boo = ({
  data,
  ppm,
  showAuxiliaryLines,
}: {
  data: Record<Column, Pos[]>;
  ppm: number;
  showAuxiliaryLines: boolean;
}) => {
```

**Keep data prop as-is.** Boo still needs the raw positions for rendering individual tapped point circles and projections. The trendline/midpoint/rotation math stays in Boo for now — it's used to draw the visualization elements. The shared `computeColumnGeometry` function extracts the same math for export/panel, but Boo's drawing code references intermediate values (projections array, trendline endpoints) that aren't in `ColumnGeometry`.

**Decision: Don't refactor Boo's internals yet.** The geometry computation is duplicated between `computeColumnGeometry` and Boo, but this is intentional for now — Boo needs intermediate values (projections, trendline endpoints) for drawing that the export doesn't need. A deeper refactor to eliminate the duplication would require changing Boo to accept a richer intermediate data structure, which is out of scope for this MVP. The pure function in `ergogen.ts` is the source of truth for exported values.

### Step 4: Verify the app still renders correctly

Run: `npm start`
Open `http://localhost:8080` in browser. Tap some points. Verify the visualization still works (circles, trendlines, keycap rectangles).

### Step 5: Commit

```bash
git add src/App.tsx
git commit -m "feat: compute column geometry in App for export/panel use"
```

**Touches:** `src/App.tsx`

---

## Task 5: Add GeometryPanel component

**Files:**
- Modify: `src/App.tsx` — add GeometryPanel component and render it
- Modify: `src/App.css` — add panel styles (if needed beyond Tailwind)

Depends on Task 4 (geometry computed in App).

### Step 1: Create the GeometryPanel component

Add above the `App` component in `src/App.tsx` (after the `Export` component, around line 380):

```tsx
const GeometryPanel = ({
  geometry,
}: {
  geometry: Record<Column, ColumnGeometry | null>;
}) => {
  const displayColumns: { name: string; key: Column }[] = [
    { name: 'pinky', key: 'pinky' },
    { name: 'ring', key: 'ring' },
    { name: 'middle', key: 'middle' },
    { name: 'index', key: 'index' },
    { name: 'inner', key: 'index_far' },
    { name: 'thumb', key: 'thumb' },
  ];

  const fmt = (n: number) => n.toFixed(1);

  return (
    <div className="overflow-x-auto text-xs font-mono pr-4">
      <table className="w-full">
        <thead>
          <tr className="text-left opacity-60">
            <th className="pr-4 pb-1">Column</th>
            <th className="pr-4 pb-1 text-right">X (mm)</th>
            <th className="pr-4 pb-1 text-right">Y (mm)</th>
            <th className="pb-1 text-right">Rotation</th>
          </tr>
        </thead>
        <tbody>
          {displayColumns.map(({ name, key }) => {
            const g = geometry[key];
            return (
              <tr key={key}>
                <td className="pr-4">{name}</td>
                <td className="pr-4 text-right">{g ? fmt(g.x_mm) : '--'}</td>
                <td className="pr-4 text-right">{g ? fmt(g.y_mm) : '--'}</td>
                <td className="text-right">{g ? `${fmt(g.rotation_deg)}°` : '--'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
```

### Step 2: Render GeometryPanel in App

In the App component's JSX (around line 475, after the control buttons `<div>` and before `</div>` closing the `.container`), add:

```tsx
<GeometryPanel geometry={geometry} />
```

The JSX should look like:

```tsx
<div className="container p-4 pt-3 pr-0 flex flex-col gap-4">
  <ColumnSelect column={column} onChange={(c) => setColumn(c)} />
  <div className="flex gap-2 pr-4">
    {/* ... existing buttons ... */}
  </div>
  <GeometryPanel geometry={geometry} />
</div>
```

### Step 3: Verify in browser

Run: `npm start`
Open `http://localhost:8080`. The panel should show `--` for all columns initially. Tap 2+ points for middle column — values should appear. Tap more columns — table fills in.

### Step 4: Commit

```bash
git add src/App.tsx
git commit -m "feat: add live GeometryPanel showing column positions"
```

**Touches:** `src/App.tsx`

---

## Task 6: Add Ergogen export to Export dropdown

**Files:**
- Modify: `src/App.tsx` — update Export component, add onErgogenExport callback

Depends on Task 3 (toErgogenYAML) and Task 4 (geometry in App).

### Step 1: Update Export component props

Change the Export component (around line 339) to accept a second export callback:

```tsx
const Export = ({
  onRawExport,
  onErgogenExport,
  state,
}: {
  onRawExport: () => void;
  onErgogenExport: () => void;
  state: PopupState;
}) => {
```

### Step 2: Uncomment and wire Ergogen dropdown item

Replace the commented-out Ergogen DropdownItem (lines 365-373) with:

```tsx
<DropdownItem onClick={onErgogenExport}>
  <span>Ergogen YAML</span>
</DropdownItem>
```

Keep the existing Raw item below it.

### Step 3: Add onErgogenExport callback in App

In the App component, after the `onRawExport` callback (around line 413), add:

```ts
const onErgogenExport = useCallback(() => {
  copy(toErgogenYAML(geometry))
    .then(() => {
      toast.success('Ergogen YAML copied to clipboard');
    })
    .catch(() => {
      toast.error('Something went wrong');
    })
    .finally(() => {
      exportState.close();
    });
}, [geometry, exportState.close]);
```

Add the import at the top of the file:

```ts
import { computeColumnGeometry, toErgogenYAML } from './ergogen';
```

(Update the existing import from Step 4.1 to also include `toErgogenYAML`.)

### Step 4: Pass the new prop to Export

Update the Export usage in App's JSX (around line 474):

```tsx
<Export
  onRawExport={onRawExport}
  onErgogenExport={onErgogenExport}
  state={exportState}
/>
```

### Step 5: Verify in browser

Run: `npm start`
1. Tap 2+ points for middle + at least one other column
2. Click Export dropdown
3. Click "Ergogen YAML"
4. Toast should say "Ergogen YAML copied to clipboard"
5. Paste in a text editor — should be valid YAML with units, zones, stagger/splay values

### Step 6: Commit

```bash
git add src/App.tsx
git commit -m "feat: add Ergogen YAML export to Export dropdown"
```

**Touches:** `src/App.tsx`

---

## Task 7: Final verification and cleanup

**Files:**
- All files from previous tasks

### Step 1: Run full test suite

Run: `npm test`
Expected: All tests pass

### Step 2: Run TypeScript check

Run: `npx tsc --noEmit`
Expected: No errors

### Step 3: Run formatter

Run: `npm run lint`
If failures: `npm run format` then re-check

### Step 4: End-to-end manual test

1. `npm start`
2. Open browser at `http://localhost:8080`
3. Tap 3+ points for each of the 6 columns
4. Verify: GeometryPanel shows values for all columns, middle = (0.0, 0.0)
5. Click Export → Ergogen YAML → paste into text editor
6. Verify: YAML has units, matrix zone with 5 columns (pinky through inner), thumb zone
7. Paste YAML into [ergogen.xyz](https://ergogen.xyz) web tool — verify it parses without errors

### Step 5: Build and test production

Run: `npm run release && npm run serve`
Open `http://localhost:3000/ergopad/` — verify the same functionality works in the production build.

### Step 6: Commit any formatting changes

```bash
git add -A
git commit -m "chore: format and clean up"
```

**Touches:** potentially any file (formatting only)

---

## File Touch Summary (for parallel batching)

| Task | Files Touched |
|------|--------------|
| Task 1 | `src/columns.ts` (new), `src/App.tsx` |
| Task 2 | `src/ergogen.ts` (new), `src/ergogen.test.tsx` (new) |
| Task 3 | `src/ergogen.ts`, `src/ergogen.test.tsx` |
| Task 4 | `src/App.tsx` |
| Task 5 | `src/App.tsx` |
| Task 6 | `src/App.tsx` |
| Task 7 | all (verification only) |

**Safe parallel batches:**
- **Batch 1:** Task 1 + Task 2 (disjoint files: columns.ts+App.tsx vs ergogen.ts+test)
- **Batch 2:** Task 3 (depends on Task 2)
- **Batch 3:** Task 4 + Task 5 + Task 6 (all touch App.tsx — must be sequential)
- **Batch 4:** Task 7 (verification)
