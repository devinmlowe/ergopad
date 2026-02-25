# Design: Column Geometry Extraction + Ergogen YAML Export

**Date:** 2026-02-24
**Status:** Approved
**Goal:** Extract per-column x, y, rotation from tapped positions, display live in UI, and export as Ergogen-compatible YAML.

## Requirements

- **Coordinate system:** Millimeters, origin at middle finger home row position (0, 0)
- **Granularity:** Per column (6 entries), not per individual key (rows are implicit at 17mm spacing)
- **Output:** Live panel in UI + Ergogen YAML clipboard export
- **Format:** Ergogen YAML snippet with stagger/spread/splay values

## Architecture: Pure Function Extraction (Approach A)

Extract the geometry computation from the Boo render callback into a standalone pure function. Both the rendering component and the export/panel consume the same computed data.

### New module: `src/ergogen.ts`

#### Core types

```ts
type ColumnGeometry = {
  x_mm: number;         // mm from middle-home origin
  y_mm: number;         // mm from middle-home origin
  rotation_deg: number; // degrees from vertical
};
```

#### Core function

```ts
function computeColumnGeometry(
  positions: Record<Column, Pos[]>,
  ppm: number,
): Record<Column, ColumnGeometry | null>
```

For each column with 2+ points:
1. Run `leastSquares(points, column !== 'thumb')` — same logic as current Boo code
2. Compute projections via `projectPointToLine(slopeInterceptFormToStandardForm(trendline))`
3. Compute midpoint: average of projected X coords, evaluate on trendline for Y
4. Compute rotation: `(Math.PI / 2 + Math.atan(slope)) * (180 / Math.PI)` degrees
5. Convert midpoint pixels to mm: `x / ppm`, `y / ppm`
6. Normalize all positions relative to middle column's home (subtract middle's x_mm, y_mm)

Columns with <2 points return `null`.

#### Ergogen YAML formatter

```ts
function toErgogenYAML(
  geometry: Record<Column, ColumnGeometry | null>,
): string
```

Maps columns to Ergogen zone structure by computing relative values between adjacent columns:
- `stagger` = y_mm difference between adjacent columns
- `spread` = x_mm difference (defaults to `kx` when consistent with 17mm spacing)
- `splay` = rotation_deg difference between adjacent columns

Output matches the template structure in `keyboard-project/LAYOUT-WORKFLOW.md` Phase 2.

### Refactor Boo component

Current state: `Boo` (App.tsx:102-234) computes trendline, projections, midpoint, and rotation inline inside its `useTwo` callback.

Change: `Boo` receives pre-computed `ColumnGeometry` data as a prop (or calls `computeColumnGeometry` itself using the shared function). Rendering uses those values instead of computing from scratch. This ensures the displayed visualization matches the exported numbers exactly.

### New component: `<GeometryPanel>`

Rendered between the toolbar and the canvas. Shows a compact table:

```
Column      X (mm)   Y (mm)   Rotation
pinky       -34.2    -6.1     5.2deg
ring        -17.1     2.3     1.8deg
middle        0.0     0.0     0.0deg
index        17.0    -3.2    -0.5deg
index_far    34.1    -5.8    -1.2deg
thumb        22.5   -28.4    18.3deg
```

- Updates live as the user taps new positions
- Shows `--` for columns with <2 points
- Compact presentation that doesn't dominate the screen

### Export integration

Add "Ergogen" option to the existing Export dropdown (App.tsx:339-380), alongside the current "Raw" option:

1. User clicks "Ergogen" in dropdown
2. Calls `toErgogenYAML(geometry)`
3. Copies result to clipboard via `copy()`
4. Shows toast: "Ergogen YAML copied to clipboard"

The currently commented-out Ergogen dropdown item (App.tsx:365-373) provides the exact insertion point.

## Data Flow

```
positions (React state) + ppm (React state)
         |
         v
computeColumnGeometry(positions, ppm)    <-- called in App component
         |
         v
geometry: Record<Column, ColumnGeometry | null>
         |
         +---> GeometryPanel    (live table display)
         |
         +---> Boo              (Two.js rendering, same data)
         |
         +---> Export button    --> toErgogenYAML(geometry) --> clipboard
```

## Files to create/modify

| File | Action | Description |
|------|--------|-------------|
| `src/ergogen.ts` | Create | `computeColumnGeometry()`, `toErgogenYAML()`, `ColumnGeometry` type |
| `src/App.tsx` | Modify | Call `computeColumnGeometry()` in App, pass to Boo/Panel/Export |
| `src/App.tsx` | Modify | Add `<GeometryPanel>` component |
| `src/App.tsx` | Modify | Add Ergogen export option to Export dropdown |
| `src/App.tsx` (Boo) | Modify | Consume pre-computed geometry instead of inline math |

## Ergogen YAML output example

```yaml
units:
  kx: 17
  ky: 17

points:
  zones:
    matrix:
      columns:
        pinky:
          key:
            stagger: -6.1
            splay: 5.2
        ring:
          key:
            stagger: 8.4
            spread: kx
            splay: -3.4
        middle:
          key:
            stagger: -2.3
            spread: kx
            splay: -1.8
        index:
          key:
            stagger: -3.2
            spread: kx
            splay: -0.5
        inner:
          key:
            stagger: -2.6
            spread: kx
            splay: -0.7
    thumb:
      anchor:
        ref: matrix_inner_bottom
        shift: [5.5, -23.2]
      columns:
        thumb:
          key:
            splay: 18.3
```

## Constraints

- Follow existing fp-ts patterns (pipe, Option) for new logic
- Keep Two.js rendering in Boo — geometry math moves out, drawing stays
- All coordinate math in pure functions (testable without React)
- Use existing `geometry.ts` types (Point2D, SlopeInterceptFormLine2D) — don't duplicate
- Pixel-to-mm conversion uses the calibrated `ppm` value throughout
