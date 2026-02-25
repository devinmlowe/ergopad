# Design: KiCad Placement Script Export

**Date:** 2026-02-24
**Status:** Approved
**Goal:** Export a KiCad Python placement script from Ergopad that positions all switch footprints at computed coordinates.

## Requirements

- Expand per-column geometry (6 columns) into individual key positions (18 matrix + 1 thumb = 19 keys)
- Output a Python script for KiCad's scripting console (`Tools > Scripting Console`)
- Script places switch footprints by reference designator at absolute board coordinates
- Compatible with KiCad 8/9 (`pcbnew` API with `VECTOR2I`)
- Download as `.py` file from the Export dropdown

## Architecture

### Key Position Expansion

From each column's `ColumnGeometry` (midpoint x_mm, y_mm + rotation_deg), compute 3 row positions:

```
For column at (x, y) with rotation R radians:
  R_rad = rotation_deg * (PI / 180)
  Home row:   (x, y)
  Top row:    (x - 17 * sin(R_rad), y - 17 * cos(R_rad))
  Bottom row: (x + 17 * sin(R_rad), y + 17 * cos(R_rad))
```

The 17mm offset is along the column's trendline direction, correctly handling splayed columns. All positions inherit the column's rotation angle.

Thumb: 1 key at its midpoint (single-row cluster).

### Coordinate System Mapping

- Ergopad: mm, origin at middle-home, Y points down (screen coordinates)
- KiCad: mm, Y points down, rotation in degrees counterclockwise
- Ergopad's coordinate system maps directly to KiCad's
- User sets a board origin offset `(ox, oy)` in the script to position the layout on their PCB

### Reference Designator Convention

Default mapping `SW1`-`SW19`, ordered by column (pinky to inner) then row (bottom, home, top), then thumb:

| Ref | Column | Row |
|-----|--------|-----|
| SW1 | pinky | bottom |
| SW2 | pinky | home |
| SW3 | pinky | top |
| SW4 | ring | bottom |
| SW5 | ring | home |
| SW6 | ring | top |
| SW7 | middle | bottom |
| SW8 | middle | home |
| SW9 | middle | top |
| SW10 | index | bottom |
| SW11 | index | home |
| SW12 | index | top |
| SW13 | inner | bottom |
| SW14 | inner | home |
| SW15 | inner | top |
| SW16 | thumb | bottom |
| SW17 | thumb | home |
| SW18 | thumb | top |
| SW19 | (spare) | — |

Note: If a column has < 2 tapped points (null geometry), its keys are omitted from the script with a comment.

### New Function: `toKiCadScript()`

```ts
// In src/ergogen.ts

type KeyPlacement = {
  ref: string;        // e.g. "SW1"
  column: string;     // e.g. "pinky"
  row: string;        // "bottom" | "home" | "top"
  x_mm: number;
  y_mm: number;
  rotation_deg: number;
};

function expandToKeys(
  geometry: Record<Column, ColumnGeometry | null>,
): KeyPlacement[]

function toKiCadScript(
  geometry: Record<Column, ColumnGeometry | null>,
): string
```

`expandToKeys()` is a pure function that converts 6 column geometries into 19 individual key placements. `toKiCadScript()` formats those placements as a Python script string.

### Output Format

```python
# Ergopad KiCad Placement Script
# Generated from hand geometry capture
# Paste into KiCad: Tools > Scripting Console
#
# Coordinate system: mm, Y-down (matches KiCad)
# Origin: middle finger home row
# Adjust ox, oy to position on your board
import pcbnew

board = pcbnew.GetBoard()

# Board origin offset — adjust to your PCB layout
ox, oy = 100.0, 100.0

placements = {
    "SW1":  (ox + -34.2, oy + 10.9,   5.2),  # pinky bottom
    "SW2":  (ox + -34.2, oy + -6.1,   5.2),  # pinky home
    "SW3":  (ox + -34.2, oy + -23.1,  5.2),  # pinky top
    # ... all keys
}

for ref, (x, y, rot) in placements.items():
    fp = board.FindFootprintByReference(ref)
    if fp:
        fp.SetPosition(pcbnew.VECTOR2I(
            pcbnew.FromMM(x), pcbnew.FromMM(y)
        ))
        fp.SetOrientationDegrees(rot)

pcbnew.Refresh()
```

## UI Integration

Add "KiCad Script" to the Export dropdown (between "Download Ergogen YAML" and "Raw"):

```
Export ▼
  Copy Ergogen YAML
  Download Ergogen YAML
  Download KiCad Script    <-- new
  Raw
```

Clicking triggers a `.py` file download (same blob-download pattern as the YAML download).

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/ergogen.ts` | Modify | Add `expandToKeys()` and `toKiCadScript()` functions |
| `src/ergogen.test.tsx` | Modify | Add tests for key expansion and script generation |
| `src/App.tsx` | Modify | Add "KiCad Script" dropdown item + download handler |

## Constraints

- Reuse existing `ColumnGeometry` type — no new data capture needed
- Keep key spacing at 17mm (matches `kx`/`ky` units)
- Pure functions for all computation (testable without React)
- Follow existing fp-ts patterns where appropriate
