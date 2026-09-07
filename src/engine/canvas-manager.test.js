import { describe, it, expect } from 'vitest';
import {
  projectMercatorPoint, normalizeRingsToCanvasPoints, clipPolygonToRect, visibleRingFraction,
} from './canvas-manager.js';

// Unprojected (plain equirectangular) fit-to-canvas — same math
// normalizeRingsToCanvasPoints used before #18's Mercator projection.
// Used as a baseline to compare projected vs. unprojected aspect ratios.
function fitUnprojected(path, width, height, padding = 40) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of path) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  const pathWidth = maxX - minX || 1;
  const pathHeight = maxY - minY || 1;
  const availWidth = width - padding * 2;
  const availHeight = height - padding * 2;
  const scale = Math.min(availWidth / pathWidth, availHeight / pathHeight);
  return { width: pathWidth * scale, height: pathHeight * scale };
}

function bbox(points) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of points) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  return { width: maxX - minX, height: maxY - minY };
}

describe('projectMercatorPoint', () => {
  it('maps the equator/prime-meridian point to the origin', () => {
    // Stored as [lon, -lat] — [0, 0] means lon=0, lat=0.
    const [x, y] = projectMercatorPoint([0, 0]);
    expect(x).toBeCloseTo(0, 10);
    expect(y).toBeCloseTo(0, 10);
  });

  it('keeps x linear in longitude', () => {
    const [x1] = projectMercatorPoint([30, 0]);
    const [x2] = projectMercatorPoint([60, 0]);
    expect(x2).toBeCloseTo(x1 * 2, 10);
  });

  it('is north-up: higher latitude (more negative stored y) projects to a smaller y', () => {
    const [, yEquator] = projectMercatorPoint([0, 0]);     // lat 0
    const [, yMidNorth] = projectMercatorPoint([0, -45]);   // lat 45
    const [, yFarNorth] = projectMercatorPoint([0, -80]);   // lat 80
    expect(yMidNorth).toBeLessThan(yEquator);
    expect(yFarNorth).toBeLessThan(yMidNorth);
  });

  it('clamps latitude beyond ±85° instead of diverging to infinity', () => {
    const [, y89] = projectMercatorPoint([0, -89]);
    const [, y85] = projectMercatorPoint([0, -85]);
    const [, y120] = projectMercatorPoint([0, -120]);
    expect(Number.isFinite(y89)).toBe(true);
    expect(y89).toBeCloseTo(y85, 10);
    expect(y120).toBeCloseTo(y85, 10);
  });
});

describe('normalizeRingsToCanvasPoints', () => {
  it('returns an empty array for no rings / only-empty rings', () => {
    expect(normalizeRingsToCanvasPoints([], 500, 500)).toEqual([]);
    expect(normalizeRingsToCanvasPoints([[]], 500, 500)).toEqual([]);
  });

  it('fits a single ring within the padded canvas bounds', () => {
    const ring = [[0, 0], [10, 0], [10, -10], [0, -10], [0, 0]];
    const [scaled] = normalizeRingsToCanvasPoints([ring], 500, 500, 40);
    for (const [x, y] of scaled) {
      expect(x).toBeGreaterThanOrEqual(40 - 0.01);
      expect(x).toBeLessThanOrEqual(460 + 0.01);
      expect(y).toBeGreaterThanOrEqual(40 - 0.01);
      expect(y).toBeLessThanOrEqual(460 + 0.01);
    }
  });

  it('fits multiple rings using ONE shared scale, keeping their relative position/size', () => {
    const mainland = [[0, 0], [10, 0], [10, -10], [0, -10], [0, 0]];
    const tinyIsland = [[20, -20], [21, -20], [21, -21], [20, -21], [20, -20]];
    const [scaledMain, scaledIsland] = normalizeRingsToCanvasPoints(
      [mainland, tinyIsland], 500, 500, 40
    );
    const mainBox = bbox(scaledMain);
    const islandBox = bbox(scaledIsland);
    // The island (1x1 in source units) must render far smaller than the
    // mainland (10x10) — proof they share one scale rather than each being
    // independently fit to fill the canvas.
    expect(islandBox.width).toBeLessThan(mainBox.width / 5);
  });

  it('fits the MAIN ring exactly as if it were the only ring — extra rings never change the scoring transform', () => {
    // A distant "island" far outside the mainland's own bounding box would,
    // under a combined-bbox fit, shrink/reposition the mainland relative to
    // a single-ring fit. It must not: ComparisonEngine scores using the
    // main ring's OWN single-ring fit, so the rendered main ring has to be
    // pixel-identical to that regardless of what other rings are present.
    const mainland = [[0, 0], [10, 0], [10, -10], [0, -10], [0, 0]];
    const farAwayIsland = [[500, -500], [501, -500], [501, -501], [500, -501], [500, -500]];

    const [aloneMain] = normalizeRingsToCanvasPoints([mainland], 500, 500, 40);
    const [withIslandMain] = normalizeRingsToCanvasPoints([mainland, farAwayIsland], 500, 500, 40);

    expect(withIslandMain).toEqual(aloneMain);
  });

  it('a Norway-shaped high-latitude path is relatively TALLER after Mercator projection than unprojected (the familiar "huge Scandinavia" look)', () => {
    // Rough real Norway bounding box: lon 5..31, lat 58..71 -> stored as [lon, -lat].
    const norwayLikeRing = [
      [5, -58], [31, -58], [31, -71], [5, -71], [5, -58],
    ];
    const width = 500, height = 500, padding = 40;

    const [projected] = normalizeRingsToCanvasPoints([norwayLikeRing], width, height, padding);
    const projectedBox = bbox(projected);
    const projectedAspect = projectedBox.height / projectedBox.width;

    const unprojectedFit = fitUnprojected(norwayLikeRing, width, height, padding);
    const unprojectedAspect = unprojectedFit.height / unprojectedFit.width;

    // Mercator stretches higher latitudes vertically (meridians "spread
    // apart" less than parallels really are toward the poles), so the same
    // shape reads noticeably taller/thinner than a plain equirectangular
    // plot of the same lon/lat box.
    expect(projectedAspect).toBeGreaterThan(unprojectedAspect * 1.05);
  });
});

describe('visibleRingFraction', () => {
  it('is 1 for a ring fully inside the canvas', () => {
    const square = [[10, 10], [20, 10], [20, 20], [10, 20]];
    expect(visibleRingFraction(square, 100, 100)).toBeCloseTo(1, 10);
  });

  it('is 0 for a ring fully outside the canvas', () => {
    const square = [[-50, -50], [-40, -50], [-40, -40], [-50, -40]];
    expect(visibleRingFraction(square, 100, 100)).toBe(0);
  });

  // Regression for #18: a Greek island ring whose bbox spanned y 317.9..351.2
  // against a 327px-tall canvas rendered as a small clipped wedge at the
  // bottom edge, reading as a rendering glitch rather than an island —
  // renderRegionRings/result-screen.js now skip a ring this poorly covered.
  it('is well under 0.5 for a ring that only barely pokes onto the canvas (the Greek-island regression)', () => {
    const mostlyOffscreen = [[280, 318], [400, 318], [400, 351], [280, 351]]; // spans y 318..351 against h=327
    expect(visibleRingFraction(mostlyOffscreen, 582, 327)).toBeLessThan(0.5);
  });

  it('is around 0.5 for a ring exactly half inside the canvas', () => {
    const halfIn = [[0, 40], [20, 40], [20, 60], [0, 60]]; // spans y 40..60, canvas h=50
    expect(visibleRingFraction(halfIn, 100, 50)).toBeCloseTo(0.5, 5);
  });
});

describe('clipPolygonToRect (exported from canvas-manager.js, canonical home)', () => {
  it('clips a polygon extending past an edge down to the visible portion', () => {
    const square = [[-50, 10], [50, 10], [50, 90], [-50, 90]];
    const clipped = clipPolygonToRect(square, 100, 100);
    for (const [x] of clipped) expect(x).toBeGreaterThanOrEqual(-1e-9);
  });
});
