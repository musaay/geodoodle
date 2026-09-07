import { describe, it, expect } from 'vitest';
import { ringBBoxOf, clipRingToBox, computeContextBox } from './generate_geo_data.js';
import { projectMercatorPoint } from '../src/engine/canvas-manager.js';

// #20's per-region geometry chunks, generated fresh by this same script —
// real output, not a fixture, so this catches an actual regression rather
// than testing a mock of itself.
const regionModules = import.meta.glob('../src/data/regions/*.js', { eager: true });

describe('ringBBoxOf', () => {
  it('computes bounds from an unordered point list', () => {
    expect(ringBBoxOf([[2, 3], [8, 1], [5, 9]])).toEqual({ minX: 2, minY: 1, maxX: 8, maxY: 9 });
  });
});

describe('clipRingToBox', () => {
  // #20: this shifts a ring into the box's own local frame, clips against
  // [0,0,w,h] via canvas-manager.js's clipPolygonToRect, then shifts back —
  // must behave exactly like a direct clip against an arbitrary box, not an
  // approximation of one.
  it('keeps a ring fully inside the box unchanged (up to rounding)', () => {
    const square = [[10, 10], [20, 10], [20, 20], [10, 20]];
    const box = { minX: 0, minY: 0, maxX: 100, maxY: 100 };
    expect(clipRingToBox(square, box)).toEqual(square);
  });

  it('clips a ring extending past the box down to the visible portion, for a box NOT anchored at the origin', () => {
    // Box is offset well away from (0,0) — proves the shift-and-restore
    // round-trip, not just a coincidental match at the origin.
    const square = [[40, 110], [160, 110], [160, 190], [40, 190]];
    const box = { minX: 100, minY: 100, maxX: 200, maxY: 200 };
    const clipped = clipRingToBox(square, box);
    for (const [x, y] of clipped) {
      expect(x).toBeGreaterThanOrEqual(box.minX - 1e-6);
      expect(x).toBeLessThanOrEqual(box.maxX + 1e-6);
      expect(y).toBeGreaterThanOrEqual(box.minY - 1e-6);
      expect(y).toBeLessThanOrEqual(box.maxY + 1e-6);
    }
    // The box's left edge (x=100) must appear in the clipped result — the
    // ring genuinely got cut there, not just translated.
    expect(clipped.some(([x]) => Math.abs(x - 100) < 1e-6)).toBe(true);
  });

  it('returns an empty ring for a box that does not overlap it at all', () => {
    const square = [[0, 0], [10, 0], [10, 10], [0, 10]];
    const box = { minX: 1000, minY: 1000, maxX: 1010, maxY: 1010 };
    expect(clipRingToBox(square, box)).toEqual([]);
  });
});

describe('computeContextBox', () => {
  // #20 follow-up: a flat 50%-each-side expansion left visible white strips
  // at the canvas edges whenever a target's own aspect ratio diverged
  // enough from the actual canvas's — e.g. a roughly-square province (like
  // Kırşehir) viewed in a wide desktop canvas. The box must instead cover
  // whatever normalizeRingsToCanvasPoints' "contain" fit (canvas-manager.js)
  // actually shows for ANY plausible canvas aspect ratio, so this checks the
  // real invariant (not a magic-number snapshot): for a representative
  // spread of target aspect ratios (tall, square, wide) and canvas aspect
  // ratios spanning the expected range, the fit's own visible lon/lat
  // extent — reproducing normalizeRingsToCanvasPoints' scale/offset math —
  // always lands fully inside computeContextBox's box.
  //
  // Must run in the SAME Web Mercator-projected space
  // normalizeRingsToCanvasPoints actually fits (canvas-manager.js): raw
  // lon/lat degrees distort vertically away from the equator, so a test
  // written in raw degrees can pass while the real, projected fit still
  // shows white canvas strips (the actual #20 bug — Kırşehir, ~39°N, has a
  // raw-degree bbox aspect of 1.33 but a true PROJECTED aspect of ~1.03,
  // needing a wider box than the raw-degree math implied).
  function visibleExtentForFit(ring, canvasAspect) {
    const { minX, minY, maxX, maxY } = { minX: Math.min(...ring.map((p) => p[0])), maxX: Math.max(...ring.map((p) => p[0])), minY: Math.min(...ring.map((p) => p[1])), maxY: Math.max(...ring.map((p) => p[1])) };
    const [px0, py0] = projectMercatorPoint([minX, minY]);
    const [px1, py1] = projectMercatorPoint([maxX, maxY]);
    const w = Math.abs(px1 - px0), h = Math.abs(py1 - py0);
    const pcx = (px0 + px1) / 2, pcy = (py0 + py1) / 2;
    // "contain" fit: available width/height are proportional to canvasAspect
    // (1 unit tall); scale is set by whichever axis is more constraining.
    const availW = canvasAspect, availH = 1;
    const scale = Math.min(availW / w, availH / h);
    const visibleProjW = availW / scale;
    const visibleProjH = availH / scale;
    return {
      minPX: pcx - visibleProjW / 2, maxPX: pcx + visibleProjW / 2,
      minPY: pcy - visibleProjH / 2, maxPY: pcy + visibleProjH / 2,
    };
  }

  // Small raw-degree magnitudes (so MAX_BOX_SIZE_DEGREES' absolute cap — a
  // real production safety net against a corrupted/spliced bbox, unrelated
  // to this test — can't interfere), placed at three representative
  // latitudes: near the equator (~0°, negligible Mercator distortion), mid
  // latitude (~39°, matching Kırşehir — where the real bug was found), and
  // high latitude (~65°, matching Norway — where distortion is most severe).
  function ringAt(centerLat, w, h) {
    const y = -centerLat; // stored [lon, -lat] convention
    return [[0, y - h / 2], [w, y - h / 2], [w, y + h / 2], [0, y + h / 2], [0, y - h / 2]];
  }
  const targetShapes = {
    'tall-equator': ringAt(0, 2, 8),
    'square-equator': ringAt(0, 4, 4),
    'wide-equator': ringAt(0, 12, 2),
    'square-midlat': ringAt(39, 4, 4),
    'square-highlat': ringAt(65, 4, 4),
    'wide-highlat': ringAt(65, 12, 2),
  };
  const canvasAspects = [1 / 1.5, 1, 16 / 9, 2.5]; // tallest to widest expected

  for (const [shapeName, ring] of Object.entries(targetShapes)) {
    for (const canvasAspect of canvasAspects) {
      it(`covers the visible extent for a ${shapeName} target on a ${canvasAspect.toFixed(2)}:1 canvas`, () => {
        const box = computeContextBox(ring);
        const [pMinX, pMinY] = projectMercatorPoint([box.minX, box.minY]);
        const [pMaxX, pMaxY] = projectMercatorPoint([box.maxX, box.maxY]);
        const boxProjMinX = Math.min(pMinX, pMaxX), boxProjMaxX = Math.max(pMinX, pMaxX);
        const boxProjMinY = Math.min(pMinY, pMaxY), boxProjMaxY = Math.max(pMinY, pMaxY);
        const visible = visibleExtentForFit(ring, canvasAspect);
        expect(boxProjMinX).toBeLessThanOrEqual(visible.minPX + 1e-9);
        expect(boxProjMaxX).toBeGreaterThanOrEqual(visible.maxPX - 1e-9);
        expect(boxProjMinY).toBeLessThanOrEqual(visible.minPY + 1e-9);
        expect(boxProjMaxY).toBeGreaterThanOrEqual(visible.maxPY - 1e-9);
      });
    }
  }

  // #20 finding: a target whose OWN bbox is itself corrupted/oversized
  // (pinned-country-paths.json's "france" ring splices in a French-Guiana
  // segment, giving a raw ~64°x49° bbox) must not blow the resulting
  // context chunk past its size budget just because the expansion cap only
  // bounds what's ADDED, not the base bbox itself.
  it('caps the overall box size even when the base (unexpanded) bbox is already huge', () => {
    const ring = [[-54, -50], [10, -50], [10, 50], [-54, 50], [-54, -50]]; // 64 wide, 100 tall
    const box = computeContextBox(ring);
    expect(box.maxX - box.minX).toBeLessThanOrEqual(50);
    expect(box.maxY - box.minY).toBeLessThanOrEqual(50);
  });
});

// #20 follow-up: a generated country's `path` spanning an extreme longitude
// range is almost certainly a spliced/corrupted ring (the France, Japan,
// Spain, Italy and Australia findings — each had a distant overseas
// territory or separate island physically merged into the mainland ring).
// Regression guard against a future pin update silently reintroducing the
// same class of bug — see MAX_VALID_PATH_LONGITUDE_SPAN's own comment for
// why the threshold is 100°, not the originally-proposed 60° (two real,
// correctly-shaped mainlands we ship — Canada, China — already exceed 60°).
describe('generated country paths (regression guard against splice bugs)', () => {
  const MAX_VALID_PATH_LONGITUDE_SPAN = 100;
  const countryModules = Object.entries(regionModules)
    .filter(([path]) => path.includes('/regions/'))
    .map(([path, mod]) => ({ id: path.match(/([^/]+)\.js$/)[1], geometry: mod.geometry }));

  it('found at least one generated region module (sanity check the glob itself)', () => {
    expect(countryModules.length).toBeGreaterThan(0);
  });

  it('every region\'s path spans no more than 100° of longitude', () => {
    for (const { id, geometry } of countryModules) {
      const { minX, maxX } = ringBBoxOf(geometry.path);
      expect(maxX - minX, `${id} path longitude span`).toBeLessThanOrEqual(MAX_VALID_PATH_LONGITUDE_SPAN);
    }
  });
});
