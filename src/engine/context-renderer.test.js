import { describe, it, expect } from 'vitest';
import { ringCentroid, ringBBox, rectsOverlap, clipPolygonToRect } from './context-renderer.js';

describe('ringCentroid', () => {
  it('averages vertices', () => {
    expect(ringCentroid([[0, 0], [10, 0], [10, 10], [0, 10]])).toEqual([5, 5]);
  });
});

describe('ringBBox', () => {
  it('computes bounds and width/height', () => {
    expect(ringBBox([[2, 3], [8, 1], [5, 9]])).toEqual({
      minX: 2, minY: 1, maxX: 8, maxY: 9, width: 6, height: 8,
    });
  });
});

describe('rectsOverlap', () => {
  const a = { minX: 0, minY: 0, maxX: 10, maxY: 10 };
  it('detects overlap', () => {
    expect(rectsOverlap(a, { minX: 5, minY: 5, maxX: 15, maxY: 15 })).toBe(true);
  });
  it('detects no overlap', () => {
    expect(rectsOverlap(a, { minX: 20, minY: 20, maxX: 30, maxY: 30 })).toBe(false);
  });
  it('touching edges do not count as overlap', () => {
    expect(rectsOverlap(a, { minX: 10, minY: 0, maxX: 20, maxY: 10 })).toBe(false);
  });
});

describe('clipPolygonToRect', () => {
  // Neighbor-label placement (#18) relies on this to find a sensible label
  // anchor for a shape that runs off-canvas — must return only the
  // on-screen portion, not the full shape.
  it('returns the polygon unchanged when fully inside the rect', () => {
    const square = [[10, 10], [20, 10], [20, 20], [10, 20]];
    expect(clipPolygonToRect(square, 100, 100)).toEqual(square);
  });

  it('returns an empty polygon when fully outside the rect', () => {
    const square = [[-50, -50], [-40, -50], [-40, -40], [-50, -40]];
    expect(clipPolygonToRect(square, 100, 100)).toEqual([]);
  });

  it('clips a polygon that extends past one edge, keeping it inside the rect', () => {
    // Spans x: -50..50, clipped against [0,100] should keep only x >= 0.
    const square = [[-50, 10], [50, 10], [50, 90], [-50, 90]];
    const clipped = clipPolygonToRect(square, 100, 100);
    for (const [x, y] of clipped) {
      expect(x).toBeGreaterThanOrEqual(-1e-9);
      expect(x).toBeLessThanOrEqual(100 + 1e-9);
      expect(y).toBeGreaterThanOrEqual(-1e-9);
      expect(y).toBeLessThanOrEqual(100 + 1e-9);
    }
    // The clipped centroid should sit within the visible half, not at the
    // original (off-screen-leaning) centroid of x=0.
    const cx = clipped.reduce((s, p) => s + p[0], 0) / clipped.length;
    expect(cx).toBeGreaterThan(0);
  });

  it('clips a polygon that fully surrounds the rect down to the rect itself', () => {
    const huge = [[-1000, -1000], [1000, -1000], [1000, 1000], [-1000, 1000]];
    const clipped = clipPolygonToRect(huge, 100, 100);
    const bbox = ringBBox(clipped);
    expect(bbox).toEqual({ minX: 0, minY: 0, maxX: 100, maxY: 100, width: 100, height: 100 });
  });
});
