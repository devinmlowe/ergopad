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

  it('computes geometry for a column with nearly vertical points', () => {
    const positions = emptyPositions();
    // 3 points nearly vertical at x~250, y varies 100-300
    // Slight x variation avoids degenerate inverted regression (division by zero)
    // ppm=5 means 1mm = 5px
    positions.middle = [
      { x: 251, y: 100 },
      { x: 250, y: 200 },
      { x: 249, y: 300 },
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
      { x: 251, y: 150 },
      { x: 249, y: 250 },
    ];
    positions.ring = [
      { x: 151, y: 150 },
      { x: 149, y: 250 },
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
