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

  for (const { ergopad, ergogen } of ergogenMatrixColumns) {
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
      lines.push(
        `        shift: [${round1(thumb.x_mm)}, ${round1(thumb.y_mm)}]`,
      );
    }
    lines.push('      columns:');
    lines.push('        thumb:');
    lines.push('          key:');
    lines.push(`            splay: ${round1(thumb.rotation_deg)}`);
  }

  lines.push('');
  return lines.join('\n');
};
