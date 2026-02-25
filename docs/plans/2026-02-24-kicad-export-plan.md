# KiCad Placement Script Export — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Add a KiCad Python placement script export that expands per-column geometry into individual key positions and generates a ready-to-paste Python script for KiCad's scripting console.

**Architecture:** Two new pure functions in `src/ergogen.ts`: `expandToKeys()` expands 6 column geometries into 19 individual key placements (3 rows x 5 matrix columns + 3 rows x 1 thumb column = 18 keys, but design says thumb is 1 key at midpoint, so we'll do 15 matrix + 3 thumb = 18, see task details). `toKiCadScript()` formats those placements as a Python script string. A new dropdown item + download handler in `src/App.tsx` triggers the download.

**Tech Stack:** TypeScript, React 17, Mocha/Chai tests via `@web/test-runner`

**Test runner:** Requires Node 16 via fnm (Snowpack 3 is incompatible with Node 22):
```sh
export PATH="$(fnm exec --using=16 bash -c 'echo $PATH')"
npm test
```

---

## File Touch Summary

| Task | `src/ergogen.ts` | `src/ergogen.test.tsx` | `src/App.tsx` |
|------|:-:|:-:|:-:|
| Task 1: expandToKeys | W | W | |
| Task 2: toKiCadScript | W | W | |
| Task 3: App integration | | | W |

Tasks 1 and 2 touch the same files sequentially. Task 3 touches only `App.tsx`.

---

### Task 1: Add `expandToKeys()` with tests

Expand per-column geometry (6 columns) into individual key placements (3 rows per matrix column at 17mm spacing along the trendline, plus 1 thumb key at its midpoint).

**Files:**
- Modify: `src/ergogen.ts` — add `KeyPlacement` type and `expandToKeys()` function
- Modify: `src/ergogen.test.tsx` — add tests for key expansion

**Step 1: Write the failing tests**

Add to `src/ergogen.test.tsx`:

```ts
import { expandToKeys } from './ergogen';
// (add to the existing import of { computeColumnGeometry, toErgogenYAML })
```

Then add a new `describe` block after the existing `toErgogenYAML` tests:

```ts
describe('expandToKeys', () => {
  it('expands all columns into 18 key placements (15 matrix + 3 thumb)', () => {
    const geometry: Record<Column, ColumnGeometry | null> = {
      pinky: { x_mm: -34.0, y_mm: -6.0, rotation_deg: 5.0 },
      ring: { x_mm: -17.0, y_mm: 2.0, rotation_deg: 2.0 },
      middle: { x_mm: 0.0, y_mm: 0.0, rotation_deg: 0.0 },
      index: { x_mm: 17.0, y_mm: -3.0, rotation_deg: -1.0 },
      index_far: { x_mm: 34.0, y_mm: -6.0, rotation_deg: -2.0 },
      thumb: { x_mm: 22.0, y_mm: -28.0, rotation_deg: 18.0 },
    };
    const keys = expandToKeys(geometry);
    // 5 matrix columns x 3 rows + 1 thumb column x 3 rows = 18
    expect(keys.length).to.equal(18);
    // First 3 should be pinky bottom/home/top
    expect(keys[0].ref).to.equal('SW1');
    expect(keys[0].column).to.equal('pinky');
    expect(keys[0].row).to.equal('bottom');
    expect(keys[1].ref).to.equal('SW2');
    expect(keys[1].row).to.equal('home');
    expect(keys[2].ref).to.equal('SW3');
    expect(keys[2].row).to.equal('top');
    // Last 3 should be thumb
    expect(keys[15].ref).to.equal('SW16');
    expect(keys[15].column).to.equal('thumb');
  });

  it('home row position matches column midpoint exactly', () => {
    const geometry: Record<Column, ColumnGeometry | null> = {
      pinky: null,
      ring: null,
      middle: { x_mm: 0.0, y_mm: 0.0, rotation_deg: 0.0 },
      index: null,
      index_far: null,
      thumb: null,
    };
    const keys = expandToKeys(geometry);
    // Only middle column → 3 keys
    expect(keys.length).to.equal(3);
    // Home row should be at the exact column midpoint
    const home = keys.find((k) => k.row === 'home')!;
    expect(home.x_mm).to.equal(0.0);
    expect(home.y_mm).to.equal(0.0);
    expect(home.rotation_deg).to.equal(0.0);
  });

  it('computes row offsets along the trendline direction', () => {
    // Column at 0 degrees rotation → rows are purely vertical (Y offset)
    const geometry: Record<Column, ColumnGeometry | null> = {
      pinky: null,
      ring: null,
      middle: { x_mm: 0.0, y_mm: 0.0, rotation_deg: 0.0 },
      index: null,
      index_far: null,
      thumb: null,
    };
    const keys = expandToKeys(geometry);
    const bottom = keys.find((k) => k.row === 'bottom')!;
    const home = keys.find((k) => k.row === 'home')!;
    const top = keys.find((k) => k.row === 'top')!;
    // At 0 degrees, offset is purely in Y: sin(0)=0, cos(0)=1
    // Bottom = home + 17mm in Y direction, top = home - 17mm
    expect(bottom.x_mm).to.equal(0.0);
    expect(bottom.y_mm).to.be.closeTo(17.0, 0.01);
    expect(top.x_mm).to.equal(0.0);
    expect(top.y_mm).to.be.closeTo(-17.0, 0.01);
    // All inherit column rotation
    expect(bottom.rotation_deg).to.equal(0.0);
    expect(top.rotation_deg).to.equal(0.0);
  });

  it('skips columns with null geometry', () => {
    const geometry: Record<Column, ColumnGeometry | null> = {
      pinky: null,
      ring: null,
      middle: { x_mm: 0.0, y_mm: 0.0, rotation_deg: 0.0 },
      index: null,
      index_far: null,
      thumb: null,
    };
    const keys = expandToKeys(geometry);
    // Only middle → 3 keys (refs should start at SW7 for middle position)
    expect(keys.length).to.equal(3);
    // Ref numbering follows the column slot, not a dense index
    expect(keys[0].ref).to.equal('SW7');
    expect(keys[1].ref).to.equal('SW8');
    expect(keys[2].ref).to.equal('SW9');
  });
});
```

**Step 2: Run tests to verify they fail**

```sh
export PATH="$(fnm exec --using=16 bash -c 'echo $PATH')"
npm test
```

Expected: FAIL — `expandToKeys` is not exported from `./ergogen`.

**Step 3: Implement `expandToKeys()`**

Add to `src/ergogen.ts`, after the existing `round1` helper and before `toErgogenYAML`:

```ts
export type KeyPlacement = {
  ref: string;
  column: string;
  row: string;
  x_mm: number;
  y_mm: number;
  rotation_deg: number;
};

/**
 * Column order for key expansion, with Ergogen-style display names.
 * Each matrix column produces 3 keys (bottom, home, top).
 * Thumb column also produces 3 keys.
 * SW ref numbering: pinky=1-3, ring=4-6, middle=7-9, index=10-12, inner=13-15, thumb=16-18
 */
const keyColumns: { ergopad: Column; name: string; refStart: number }[] = [
  { ergopad: 'pinky', name: 'pinky', refStart: 1 },
  { ergopad: 'ring', name: 'ring', refStart: 4 },
  { ergopad: 'middle', name: 'middle', refStart: 7 },
  { ergopad: 'index', name: 'index', refStart: 10 },
  { ergopad: 'index_far', name: 'inner', refStart: 13 },
  { ergopad: 'thumb', name: 'thumb', refStart: 16 },
];

const rows: { name: string; offset: number }[] = [
  { name: 'bottom', offset: 1 },
  { name: 'home', offset: 0 },
  { name: 'top', offset: -1 },
];

/**
 * Expand per-column geometry into individual key placements.
 * Each column with geometry produces 3 keys (bottom, home, top)
 * at 17mm spacing along the column's trendline direction.
 *
 * Row offset math for column at (x, y) with rotation R degrees:
 *   R_rad = R * (PI / 180)
 *   key.x = x + offset * 17 * sin(R_rad)
 *   key.y = y + offset * 17 * cos(R_rad)
 * where offset = +1 (bottom), 0 (home), -1 (top)
 */
export const expandToKeys = (
  geometry: Record<Column, ColumnGeometry | null>,
): KeyPlacement[] => {
  const keys: KeyPlacement[] = [];

  for (const { ergopad, name, refStart } of keyColumns) {
    const col = geometry[ergopad];
    if (col === null) continue;

    const rRad = col.rotation_deg * (Math.PI / 180);

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      keys.push({
        ref: `SW${refStart + i}`,
        column: name,
        row: row.name,
        x_mm: round1(col.x_mm + row.offset * 17 * Math.sin(rRad)),
        y_mm: round1(col.y_mm + row.offset * 17 * Math.cos(rRad)),
        rotation_deg: col.rotation_deg,
      });
    }
  }

  return keys;
};
```

**Step 4: Run tests to verify they pass**

```sh
export PATH="$(fnm exec --using=16 bash -c 'echo $PATH')"
npm test
```

Expected: All `expandToKeys` tests PASS.

**Step 5: Commit**

```sh
git add src/ergogen.ts src/ergogen.test.tsx
git commit -m "feat: add expandToKeys() for individual key position expansion"
```

---

### Task 2: Add `toKiCadScript()` with tests

Format key placements as a KiCad Python placement script string.

**Files:**
- Modify: `src/ergogen.ts` — add `toKiCadScript()` function
- Modify: `src/ergogen.test.tsx` — add tests for script generation

**Step 1: Write the failing tests**

Add to `src/ergogen.test.tsx`:

```ts
import { expandToKeys, toKiCadScript } from './ergogen';
// (update existing import line)
```

Then add a new `describe` block:

```ts
describe('toKiCadScript', () => {
  it('generates valid Python script with import, board, and placements', () => {
    const geometry: Record<Column, ColumnGeometry | null> = {
      pinky: { x_mm: -34.0, y_mm: -6.0, rotation_deg: 5.0 },
      ring: { x_mm: -17.0, y_mm: 2.0, rotation_deg: 2.0 },
      middle: { x_mm: 0.0, y_mm: 0.0, rotation_deg: 0.0 },
      index: { x_mm: 17.0, y_mm: -3.0, rotation_deg: -1.0 },
      index_far: { x_mm: 34.0, y_mm: -6.0, rotation_deg: -2.0 },
      thumb: { x_mm: 22.0, y_mm: -28.0, rotation_deg: 18.0 },
    };
    const script = toKiCadScript(geometry);
    // Should contain Python preamble
    expect(script).to.include('import pcbnew');
    expect(script).to.include('board = pcbnew.GetBoard()');
    // Should contain origin offset variables
    expect(script).to.include('ox, oy = 100.0, 100.0');
    // Should contain all 18 switch placements
    expect(script).to.include('"SW1"');
    expect(script).to.include('"SW18"');
    // Should contain column/row comments
    expect(script).to.include('# pinky bottom');
    expect(script).to.include('# thumb top');
    // Should contain the placement loop
    expect(script).to.include('pcbnew.VECTOR2I');
    expect(script).to.include('SetOrientationDegrees');
    expect(script).to.include('pcbnew.Refresh()');
  });

  it('omits keys for null columns with a comment', () => {
    const geometry: Record<Column, ColumnGeometry | null> = {
      pinky: null,
      ring: null,
      middle: { x_mm: 0.0, y_mm: 0.0, rotation_deg: 0.0 },
      index: null,
      index_far: null,
      thumb: null,
    };
    const script = toKiCadScript(geometry);
    // Should only have SW7/SW8/SW9 (middle column)
    expect(script).to.include('"SW7"');
    expect(script).to.include('"SW8"');
    expect(script).to.include('"SW9"');
    // Should not contain other columns
    expect(script).to.not.include('"SW1"');
    expect(script).to.not.include('"SW16"');
  });
});
```

**Step 2: Run tests to verify they fail**

```sh
export PATH="$(fnm exec --using=16 bash -c 'echo $PATH')"
npm test
```

Expected: FAIL — `toKiCadScript` is not exported from `./ergogen`.

**Step 3: Implement `toKiCadScript()`**

Add to `src/ergogen.ts`, after `expandToKeys`:

```ts
/**
 * Generate a KiCad Python placement script from column geometry.
 * The script can be pasted into KiCad's Tools > Scripting Console
 * to place all switch footprints at the correct positions.
 */
export const toKiCadScript = (
  geometry: Record<Column, ColumnGeometry | null>,
): string => {
  const keys = expandToKeys(geometry);
  const lines: string[] = [];

  lines.push('# Ergopad KiCad Placement Script');
  lines.push('# Generated from hand geometry capture');
  lines.push('# Paste into KiCad: Tools > Scripting Console');
  lines.push('#');
  lines.push('# Coordinate system: mm, Y-down (matches KiCad)');
  lines.push('# Origin: middle finger home row');
  lines.push('# Adjust ox, oy to position on your board');
  lines.push('import pcbnew');
  lines.push('');
  lines.push('board = pcbnew.GetBoard()');
  lines.push('');
  lines.push('# Board origin offset — adjust to your PCB layout');
  lines.push('ox, oy = 100.0, 100.0');
  lines.push('');
  lines.push('placements = {');

  for (const key of keys) {
    const x = key.x_mm.toFixed(1);
    const y = key.y_mm.toFixed(1);
    const rot = key.rotation_deg.toFixed(1);
    const pad = key.ref.length < 4 ? ' ' : '';
    lines.push(
      `    "${key.ref}": ${pad}(ox + ${x}, oy + ${y}, ${rot}),  # ${key.column} ${key.row}`,
    );
  }

  lines.push('}');
  lines.push('');
  lines.push('for ref, (x, y, rot) in placements.items():');
  lines.push('    fp = board.FindFootprintByReference(ref)');
  lines.push('    if fp:');
  lines.push('        fp.SetPosition(pcbnew.VECTOR2I(');
  lines.push('            pcbnew.FromMM(x), pcbnew.FromMM(y)');
  lines.push('        ))');
  lines.push('        fp.SetOrientationDegrees(rot)');
  lines.push('');
  lines.push('pcbnew.Refresh()');
  lines.push('');

  return lines.join('\n');
};
```

**Step 4: Run tests to verify they pass**

```sh
export PATH="$(fnm exec --using=16 bash -c 'echo $PATH')"
npm test
```

Expected: All `toKiCadScript` tests PASS.

**Step 5: Commit**

```sh
git add src/ergogen.ts src/ergogen.test.tsx
git commit -m "feat: add toKiCadScript() for KiCad placement script export"
```

---

### Task 3: Add KiCad Script download to App

Add a "Download KiCad Script" dropdown item to the Export menu and wire up the download handler.

**Files:**
- Modify: `src/App.tsx:331-373` — add `onKiCadDownload` prop to Export component, add dropdown item
- Modify: `src/App.tsx:470-480` — add `onKiCadDownload` callback (after `onErgogenDownload`)
- Modify: `src/App.tsx:541-546` — pass new prop to `<Export>`

**Step 1: Add `onKiCadDownload` prop to `Export` component**

In `src/App.tsx`, modify the `Export` component (around line 331):

Change the props type to include `onKiCadDownload`:

```ts
const Export = ({
  onRawExport,
  onErgogenExport,
  onErgogenDownload,
  onKiCadDownload,
  state,
}: {
  onRawExport: () => void;
  onErgogenExport: () => void;
  onErgogenDownload: () => void;
  onKiCadDownload: () => void;
  state: PopupState;
}) => {
```

Add the dropdown item between "Download Ergogen YAML" and "Raw" (after line 366):

```tsx
        <DropdownItem onClick={onKiCadDownload}>
          <span>Download KiCad Script</span>
        </DropdownItem>
```

**Step 2: Add the import for `toKiCadScript`**

At the top of `src/App.tsx`, update the ergogen import:

```ts
import { computeColumnGeometry, toErgogenYAML, toKiCadScript } from './ergogen';
```

**Step 3: Add `onKiCadDownload` callback in App**

In the `App` component, after the `onErgogenDownload` callback (around line 480), add:

```ts
  const onKiCadDownload = useCallback(() => {
    const script = toKiCadScript(geometry);
    const blob = new Blob([script], { type: 'text/x-python' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ergopad-placement.py';
    a.click();
    URL.revokeObjectURL(url);
    exportState.close();
  }, [geometry, exportState.close]);
```

**Step 4: Pass the new prop to `<Export>`**

Around line 541-546, add `onKiCadDownload` to the `<Export>` JSX:

```tsx
          <Export
            onRawExport={onRawExport}
            onErgogenExport={onErgogenExport}
            onErgogenDownload={onErgogenDownload}
            onKiCadDownload={onKiCadDownload}
            state={exportState}
          />
```

**Step 5: Verify TypeScript compiles**

```sh
npx tsc --noEmit
```

Expected: 0 errors.

**Step 6: Build and verify**

```sh
npm run release
```

Expected: Build completes successfully.

**Step 7: Commit**

```sh
git add src/App.tsx
git commit -m "feat: add KiCad Script download to Export dropdown"
```

---

### Task 4: Final verification

Run the full test suite and verify the build.

**Step 1: Run all tests**

```sh
export PATH="$(fnm exec --using=16 bash -c 'echo $PATH')"
npm test
```

Expected: All `ergogen.test.tsx` tests pass (the pre-existing `App.test.tsx` failure is a known upstream issue — ignore it).

**Step 2: TypeScript check**

```sh
npx tsc --noEmit
```

Expected: 0 errors.

**Step 3: Prettier formatting**

```sh
npx prettier --write src/ergogen.ts src/ergogen.test.tsx src/App.tsx
```

**Step 4: Build**

```sh
npm run release
```

Expected: Build completes.

**Step 5: Commit any formatting changes**

```sh
git add -A
git diff --cached --stat
# Only commit if there are changes
git commit -m "chore: format files with Prettier"
```
