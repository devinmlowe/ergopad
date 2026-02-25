import { expect } from 'chai';
import type { Point2D } from './geometry';
import type { Column } from './columns';
import {
  computeColumnGeometry,
  toErgogenYAML,
  expandToKeys,
  toKiCadScript,
} from './ergogen';
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

// Helper: create geometry record with all null columns
const nullGeometry = (): Record<Column, ColumnGeometry | null> => ({
  pinky: null,
  ring: null,
  middle: null,
  index: null,
  index_far: null,
  thumb: null,
});

describe('expandToKeys', () => {
  it('expands all columns into 18 key placements', () => {
    const geometry = nullGeometry();
    geometry.pinky = { x_mm: -34, y_mm: -6, rotation_deg: 5 };
    geometry.ring = { x_mm: -17, y_mm: 2, rotation_deg: 2 };
    geometry.middle = { x_mm: 0, y_mm: 0, rotation_deg: 0 };
    geometry.index = { x_mm: 17, y_mm: -3, rotation_deg: -1 };
    geometry.index_far = { x_mm: 34, y_mm: -6, rotation_deg: -2 };
    geometry.thumb = { x_mm: 22, y_mm: -28, rotation_deg: 18 };

    const keys = expandToKeys(geometry);
    expect(keys).to.have.length(18);
    // First 3 keys should be pinky bottom/home/top
    expect(keys[0].ref).to.equal('SW1');
    expect(keys[0].column).to.equal('pinky');
    expect(keys[0].row).to.equal('bottom');
    expect(keys[1].ref).to.equal('SW2');
    expect(keys[1].column).to.equal('pinky');
    expect(keys[1].row).to.equal('home');
    expect(keys[2].ref).to.equal('SW3');
    expect(keys[2].column).to.equal('pinky');
    expect(keys[2].row).to.equal('top');
    // Last 3 keys should be thumb SW16/SW17/SW18
    expect(keys[15].ref).to.equal('SW16');
    expect(keys[15].column).to.equal('thumb');
    expect(keys[15].row).to.equal('bottom');
    expect(keys[16].ref).to.equal('SW17');
    expect(keys[16].column).to.equal('thumb');
    expect(keys[16].row).to.equal('home');
    expect(keys[17].ref).to.equal('SW18');
    expect(keys[17].column).to.equal('thumb');
    expect(keys[17].row).to.equal('top');
  });

  it('home row matches column midpoint exactly', () => {
    const geometry = nullGeometry();
    // Middle column at origin — home row should be exactly (0, 0, 0)
    geometry.middle = { x_mm: 0, y_mm: 0, rotation_deg: 0 };

    const keys = expandToKeys(geometry);
    const home = keys.find((k) => k.row === 'home')!;
    expect(home.x_mm).to.equal(0);
    expect(home.y_mm).to.equal(0);
    expect(home.rotation_deg).to.equal(0);
  });

  it('row offsets along trendline direction', () => {
    const geometry = nullGeometry();
    // 0 degrees rotation: trendline is vertical, so offsets are purely in Y
    geometry.middle = { x_mm: 10, y_mm: 0, rotation_deg: 0 };

    const keys = expandToKeys(geometry);
    const bottom = keys.find((k) => k.row === 'bottom')!;
    const home = keys.find((k) => k.row === 'home')!;
    const top = keys.find((k) => k.row === 'top')!;

    // At 0 deg rotation: sin(0)=0, cos(0)=1
    // Bottom: y + 1*17*cos(0) = 0 + 17 = 17, x unchanged
    expect(bottom.x_mm).to.equal(10);
    expect(bottom.y_mm).to.equal(17);
    // Home: no offset
    expect(home.x_mm).to.equal(10);
    expect(home.y_mm).to.equal(0);
    // Top: y + (-1)*17*cos(0) = 0 - 17 = -17, x unchanged
    expect(top.x_mm).to.equal(10);
    expect(top.y_mm).to.equal(-17);
  });

  it('skips null columns, preserves ref numbering', () => {
    const geometry = nullGeometry();
    // Only middle populated — should get SW7/SW8/SW9
    geometry.middle = { x_mm: 0, y_mm: 0, rotation_deg: 0 };

    const keys = expandToKeys(geometry);
    expect(keys).to.have.length(3);
    expect(keys[0].ref).to.equal('SW7');
    expect(keys[0].row).to.equal('bottom');
    expect(keys[1].ref).to.equal('SW8');
    expect(keys[1].row).to.equal('home');
    expect(keys[2].ref).to.equal('SW9');
    expect(keys[2].row).to.equal('top');
  });
});

describe('toKiCadScript', () => {
  it('generates valid Python script with all sections', () => {
    const geometry = nullGeometry();
    geometry.pinky = { x_mm: -34, y_mm: -6, rotation_deg: 5 };
    geometry.ring = { x_mm: -17, y_mm: 2, rotation_deg: 2 };
    geometry.middle = { x_mm: 0, y_mm: 0, rotation_deg: 0 };
    geometry.index = { x_mm: 17, y_mm: -3, rotation_deg: -1 };
    geometry.index_far = { x_mm: 34, y_mm: -6, rotation_deg: -2 };
    geometry.thumb = { x_mm: 22, y_mm: -28, rotation_deg: 18 };

    const script = toKiCadScript(geometry);
    // Header / imports
    expect(script).to.include('import pcbnew');
    expect(script).to.include('board = pcbnew.GetBoard()');
    expect(script).to.include('ox, oy = 100.0, 100.0');
    // All 18 refs present
    expect(script).to.include('"SW1"');
    expect(script).to.include('"SW18"');
    // Column/row comments
    expect(script).to.include('# pinky bottom');
    expect(script).to.include('# thumb top');
    // Footer code
    expect(script).to.include('pcbnew.VECTOR2I');
    expect(script).to.include('SetOrientationDegrees');
    expect(script).to.include('pcbnew.Refresh()');
  });

  it('omits keys for null columns', () => {
    const geometry = nullGeometry();
    geometry.middle = { x_mm: 0, y_mm: 0, rotation_deg: 0 };

    const script = toKiCadScript(geometry);
    // Middle keys present
    expect(script).to.include('"SW7"');
    expect(script).to.include('"SW8"');
    expect(script).to.include('"SW9"');
    // No pinky or thumb keys
    expect(script).to.not.include('"SW1"');
    expect(script).to.not.include('"SW16"');
  });
});
