import { expect } from 'chai';
import type { Point2D } from './geometry';
import type { Column } from './columns';
import { computeColumnGeometry, toErgogenYAML } from './ergogen';
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

describe('toErgogenYAML', () => {
  it('produces valid YAML with stagger/spread/splay for populated columns', () => {
    const geometry: Record<Column, ColumnGeometry | null> = {
      pinky: { x_mm: -34.0, y_mm: -6.0, rotation_deg: 5.0 },
      ring: { x_mm: -17.0, y_mm: 2.0, rotation_deg: 2.0 },
      middle: { x_mm: 0.0, y_mm: 0.0, rotation_deg: 0.0 },
      index: { x_mm: 17.0, y_mm: -3.0, rotation_deg: -1.0 },
      index_far: { x_mm: 34.0, y_mm: -6.0, rotation_deg: -2.0 },
      thumb: { x_mm: 22.0, y_mm: -28.0, rotation_deg: 18.0 },
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
    // Verify computed delta values (ring relative to pinky):
    // stagger = 2.0 - (-6.0) = 8, spread = -17.0 - (-34.0) = 17, splay = 2.0 - 5.0 = -3
    expect(yaml).to.include('stagger: 8');
    expect(yaml).to.include('spread: 17');
    expect(yaml).to.include('splay: -3');
  });

  it('skips columns with null geometry', () => {
    const geometry: Record<Column, ColumnGeometry | null> = {
      pinky: null,
      ring: null,
      middle: { x_mm: 0, y_mm: 0, rotation_deg: 0 },
      index: { x_mm: 17, y_mm: -3, rotation_deg: -1 },
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
