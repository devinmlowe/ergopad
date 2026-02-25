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
