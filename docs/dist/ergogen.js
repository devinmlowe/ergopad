import {
  projectPointToLine,
  slopeInterceptFormToStandardForm
} from "./geometry.js";
import {leastSquares} from "./leastSquares.js";
const computeSingleColumn = (points, column) => {
  if (points.length < 2)
    return null;
  const trendline = leastSquares(points, column !== "thumb");
  const projections = points.map(projectPointToLine(slopeInterceptFormToStandardForm(trendline)));
  const xs = projections.map(({x}) => x);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const averageX = (maxX - minX) / 2 + minX;
  return {
    x_px: averageX,
    y_px: trendline.m * averageX + trendline.b,
    rotation_deg: (Math.PI / 2 + Math.atan(trendline.m)) * (180 / Math.PI)
  };
};
export const computeColumnGeometry = (positions, ppm) => {
  const raw = {
    thumb: computeSingleColumn(positions.thumb, "thumb"),
    index_far: computeSingleColumn(positions.index_far, "index_far"),
    index: computeSingleColumn(positions.index, "index"),
    middle: computeSingleColumn(positions.middle, "middle"),
    ring: computeSingleColumn(positions.ring, "ring"),
    pinky: computeSingleColumn(positions.pinky, "pinky")
  };
  const origin = raw.middle;
  if (origin === null) {
    return {
      thumb: null,
      index_far: null,
      index: null,
      middle: null,
      ring: null,
      pinky: null
    };
  }
  const toMm = (r) => ({
    x_mm: (r.x_px - origin.x_px) / ppm,
    y_mm: (r.y_px - origin.y_px) / ppm,
    rotation_deg: r.rotation_deg
  });
  const result = {};
  for (const col of Object.keys(raw)) {
    const r = raw[col];
    result[col] = r === null ? null : toMm(r);
  }
  return result;
};
const ergogenMatrixColumns = [
  {ergopad: "pinky", ergogen: "pinky"},
  {ergopad: "ring", ergogen: "ring"},
  {ergopad: "middle", ergogen: "middle"},
  {ergopad: "index", ergogen: "index"},
  {ergopad: "index_far", ergogen: "inner"}
];
const round1 = (n) => Math.round(n * 10) / 10;
const columnRefSlots = [
  {column: "pinky", label: "pinky", startRef: 1},
  {column: "ring", label: "ring", startRef: 4},
  {column: "middle", label: "middle", startRef: 7},
  {column: "index", label: "index", startRef: 10},
  {column: "index_far", label: "inner", startRef: 13},
  {column: "thumb", label: "thumb", startRef: 16}
];
const rows = [
  {name: "bottom", offset: 1},
  {name: "home", offset: 0},
  {name: "top", offset: -1}
];
export const expandToKeys = (geometry) => {
  const keys = [];
  for (const {column, label, startRef} of columnRefSlots) {
    const col = geometry[column];
    if (col === null)
      continue;
    const rRad = col.rotation_deg * (Math.PI / 180);
    for (let i = 0; i < rows.length; i++) {
      const {name, offset} = rows[i];
      keys.push({
        ref: `SW${startRef + i}`,
        column: label,
        row: name,
        x_mm: round1(col.x_mm + offset * 17 * Math.sin(rRad)),
        y_mm: round1(col.y_mm + offset * 17 * Math.cos(rRad)),
        rotation_deg: col.rotation_deg
      });
    }
  }
  return keys;
};
export const toKiCadScript = (geometry) => {
  const keys = expandToKeys(geometry);
  const lines = [];
  lines.push("# Ergopad KiCad Placement Script");
  lines.push("# Generated from hand geometry capture");
  lines.push("# Paste into KiCad: Tools > Scripting Console");
  lines.push("#");
  lines.push("# Coordinate system: mm, Y-down (matches KiCad)");
  lines.push("# Origin: middle finger home row");
  lines.push("# Adjust ox, oy to position on your board");
  lines.push("import pcbnew");
  lines.push("");
  lines.push("board = pcbnew.GetBoard()");
  lines.push("");
  lines.push("# Board origin offset — adjust to your PCB layout");
  lines.push("ox, oy = 100.0, 100.0");
  lines.push("");
  lines.push("placements = {");
  for (const key of keys) {
    const x = key.x_mm.toFixed(1);
    const y = key.y_mm.toFixed(1);
    const rot = key.rotation_deg.toFixed(1);
    const refStr = `"${key.ref}"`;
    const pad = key.ref.length < 4 ? "  " : " ";
    lines.push(`    ${refStr}:${pad}(ox + ${x}, oy + ${y}, ${rot}),  # ${key.column} ${key.row}`);
  }
  lines.push("}");
  lines.push("");
  lines.push("for ref, (x, y, rot) in placements.items():");
  lines.push("    fp = board.FindFootprintByReference(ref)");
  lines.push("    if fp:");
  lines.push("        fp.SetPosition(pcbnew.VECTOR2I(");
  lines.push("            pcbnew.FromMM(x), pcbnew.FromMM(y)");
  lines.push("        ))");
  lines.push("        fp.SetOrientationDegrees(rot)");
  lines.push("");
  lines.push("pcbnew.Refresh()");
  lines.push("");
  return lines.join("\n");
};
export const toErgogenYAML = (geometry) => {
  const lines = [];
  lines.push("units:");
  lines.push("  kx: 17");
  lines.push("  ky: 17");
  lines.push("");
  lines.push("points:");
  lines.push("  zones:");
  lines.push("    matrix:");
  lines.push("      columns:");
  let prevCol = null;
  for (const {ergopad, ergogen} of ergogenMatrixColumns) {
    const col = geometry[ergopad];
    if (col === null) {
      prevCol = null;
      continue;
    }
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
      lines.push(`            stagger: ${round1(col.y_mm)}`);
      if (col.rotation_deg !== 0) {
        lines.push(`            splay: ${round1(col.rotation_deg)}`);
      }
    }
    prevCol = col;
  }
  const thumb = geometry.thumb;
  if (thumb !== null) {
    lines.push("");
    lines.push("    thumb:");
    lines.push("      anchor:");
    lines.push("        ref: matrix_inner_bottom");
    const inner = geometry.index_far;
    if (inner !== null) {
      const shiftX = round1(thumb.x_mm - inner.x_mm);
      const shiftY = round1(thumb.y_mm - inner.y_mm);
      lines.push(`        shift: [${shiftX}, ${shiftY}]`);
    } else {
      lines.push(`        shift: [${round1(thumb.x_mm)}, ${round1(thumb.y_mm)}]`);
    }
    lines.push("      columns:");
    lines.push("        thumb:");
    lines.push("          key:");
    lines.push(`            splay: ${round1(thumb.rotation_deg)}`);
  }
  lines.push("");
  return lines.join("\n");
};
