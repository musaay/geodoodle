// Mercator diverges to infinity at the poles; clamping keeps far-north/south
// vertices (e.g. Svalbard slivers in far-north source data) from blowing up
// the projected bounding box. 85° is the conventional Web Mercator cutoff
// (as used by Google/OSM's tiling scheme).
const MAX_MERCATOR_LAT = 85;

/**
 * Web Mercator projection of ONE stored region point. Region data is
 * generated as `[lon, -lat]` (see scripts/generate_geo_data.js) — the
 * generator negates latitude so that "up" in the stored coordinate space
 * already means north, matching a screen's y-down convention. Mercator's
 * own y (`ln(tan(pi/4 + lat/2))`) increases with latitude, the opposite of
 * that convention, so it's negated here too, to keep the same north-up
 * orientation the rest of the pipeline (and un-projected fallbacks) assume.
 *
 * This is the ONLY place lon/lat gets projected — both target-outline
 * rendering (renderRegionOutline/renderRegionRings) and scoring
 * (ComparisonEngine, via normalizePathToCanvas) route through
 * `normalizePathToCanvasPoints` below, so they can never drift apart.
 */
export function projectMercatorPoint([lon, negLat]) {
  const lat = Math.max(-MAX_MERCATOR_LAT, Math.min(MAX_MERCATOR_LAT, -negLat));
  const lonRad = (lon * Math.PI) / 180;
  const latRad = (lat * Math.PI) / 180;
  const mercY = Math.log(Math.tan(Math.PI / 4 + latRad / 2));
  return [lonRad, -mercY];
}

/**
 * Sutherland-Hodgman clip of `polygon` against the rectangle [0,0,w,h].
 * Used two ways: (1) context-renderer.js anchors a neighbour label at the
 * centroid of just a shape's ON-SCREEN portion, so a country that runs off
 * the edge (Russia next to a small target) still gets a sensibly-placed
 * label instead of one at an off-screen/unrelated point; (2)
 * `visibleRingArea` below, to decide whether an extra ring (an island) is
 * worth drawing at all when most of it falls outside the canvas.
 */
export function clipPolygonToRect(polygon, w, h) {
  const clipEdge = (poly, inside, intersect) => {
    if (poly.length === 0) return poly;
    const out = [];
    for (let i = 0; i < poly.length; i++) {
      const curr = poly[i];
      const prev = poly[(i - 1 + poly.length) % poly.length];
      const currIn = inside(curr);
      const prevIn = inside(prev);
      if (currIn) {
        if (!prevIn) out.push(intersect(prev, curr));
        out.push(curr);
      } else if (prevIn) {
        out.push(intersect(prev, curr));
      }
    }
    return out;
  };
  const lerpX = (a, b, x) => [x, a[1] + ((x - a[0]) / (b[0] - a[0])) * (b[1] - a[1])];
  const lerpY = (a, b, y) => [a[0] + ((y - a[1]) / (b[1] - a[1])) * (b[0] - a[0]), y];

  let poly = polygon;
  poly = clipEdge(poly, (p) => p[0] >= 0, (a, b) => lerpX(a, b, 0));
  poly = clipEdge(poly, (p) => p[0] <= w, (a, b) => lerpX(a, b, w));
  poly = clipEdge(poly, (p) => p[1] >= 0, (a, b) => lerpY(a, b, 0));
  poly = clipEdge(poly, (p) => p[1] <= h, (a, b) => lerpY(a, b, h));
  return poly;
}

// Shoelace-formula polygon area, used only to compare a ring's on-screen
// portion against its full size — never a real-world area.
function polygonArea(ring) {
  let area = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    area += x1 * y2 - x2 * y1;
  }
  return Math.abs(area / 2);
}

/**
 * Fraction (0-1) of `ring`'s own area that actually falls within the
 * [0,0,w,h] canvas. An island ring is fit using the SAME transform as the
 * main ring (see normalizeRingsToCanvasPoints's doc comment) — it renders
 * wherever that puts it, which can be mostly or entirely off-canvas (a
 * southern Greek island, Norway's Svalbard, Hawaii for the US). Rendering
 * just the sliver that happens to poke on-screen reads as a rendering
 * glitch (a stray, jagged partial shape at the edge) rather than a
 * recognizable island, so callers use this to skip a ring outright instead.
 */
export function visibleRingFraction(ring, w, h) {
  const fullArea = polygonArea(ring);
  if (fullArea === 0) return 0;
  const clipped = clipPolygonToRect(ring, w, h);
  if (clipped.length < 3) return 0;
  return polygonArea(clipped) / fullArea;
}

/**
 * Pure geometry behind CanvasManager#normalizePathToCanvas — projects every
 * ring with `projectMercatorPoint`, then fits them into `width`x`height`
 * (minus `padding`), preserving aspect ratio. Critically, the fit (scale +
 * offset) is derived from the FIRST ring only (the main/scored ring — see
 * `rings[0] === path` in the generated data), never from a bounding box
 * that also includes islands: ComparisonEngine scores against the main
 * ring's own single-ring fit, so that has to stay the one and only
 * transform basis, or a region's outline would render at a different
 * scale/position than what's actually scored the moment its rings extend
 * beyond the main ring's bounding box (e.g. Japan's Hokkaido, Norway's
 * Svalbard). Extra rings are just reprojected through that same transform
 * and drawn wherever it puts them — purely decorative, never fit for their
 * own framing.
 *
 * Exported standalone (no `this`/DOM) so it's unit-testable without a real
 * CanvasManager, which needs a live DOM (ResizeObserver, canvas element).
 * Returns an array of rings, each an array of `[x, y]` canvas points.
 */
export function normalizeRingsToCanvasPoints(rings, width, height, padding = 40) {
  const nonEmptyRings = (rings || []).filter((r) => r && r.length > 0);
  if (nonEmptyRings.length === 0) return [];

  const projectedRings = nonEmptyRings.map((ring) => ring.map(projectMercatorPoint));
  const mainRing = projectedRings[0];

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of mainRing) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }

  const pathWidth = maxX - minX || 1;
  const pathHeight = maxY - minY || 1;

  const availWidth = width - padding * 2;
  const availHeight = height - padding * 2;

  const scale = Math.min(availWidth / pathWidth, availHeight / pathHeight);

  const scaledWidth = pathWidth * scale;
  const scaledHeight = pathHeight * scale;
  const offsetX = padding + (availWidth - scaledWidth) / 2;
  const offsetY = padding + (availHeight - scaledHeight) / 2;

  return projectedRings.map((ring) => ring.map(([x, y]) => [
    offsetX + (x - minX) * scale,
    offsetY + (y - minY) * scale,
  ]));
}

/**
 * CanvasManager - Manages the HTML5 Canvas element
 * Handles DPR scaling, coordinate transformation, and region rendering
 */
export class CanvasManager {
  constructor(containerElement) {
    this.container = containerElement;
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.dpr = window.devicePixelRatio || 1;
    this.width = 0;
    this.height = 0;

    this.canvas.style.display = 'block';
    this.container.appendChild(this.canvas);
    
    this.onResizeCallback = null;
    
    // Use ResizeObserver to detect real CSS size changes
    this.resizeObserver = new ResizeObserver(() => {
      this.resize();
      if (this.onResizeCallback) this.onResizeCallback();
    });
    this.resizeObserver.observe(this.container);
    
    this.resize();
  }

  setOnResize(callback) {
    this.onResizeCallback = callback;
  }

  resize() {
    const rect = this.container.getBoundingClientRect();
    this.width = rect.width;
    this.height = rect.height;
    this.canvas.width = this.width * this.dpr;
    this.canvas.height = this.height * this.dpr;
    this.canvas.style.width = this.width + 'px';
    this.canvas.style.height = this.height + 'px';
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  clear() {
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.ctx.clearRect(0, 0, this.width, this.height);
  }

  getContext() { return this.ctx; }
  getCanvas() { return this.canvas; }
  getWidth() { return this.width; }
  getHeight() { return this.height; }

  /** Convert page/client coordinates to canvas coordinates */
  pageToCanvas(pageX, pageY) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: pageX - rect.left,
      y: pageY - rect.top
    };
  }

  /**
   * Projects a region path (lon/-lat) with Web Mercator and fits it to the
   * canvas, maintaining aspect ratio and centering the shape. The single
   * shared transform both target rendering and ComparisonEngine scoring
   * use — see normalizeRingsToCanvasPoints's doc comment above.
   */
  normalizePathToCanvas(path, padding = 40) {
    return normalizeRingsToCanvasPoints([path], this.width, this.height, padding)[0] || [];
  }

  /**
   * Same as normalizePathToCanvas, but for a multi-part region's full ring
   * set (#18) — every ring shares the fit derived from the main (first)
   * ring alone, the same one ComparisonEngine scores against, so extra
   * rings (islands) render wherever that implies rather than getting their
   * own independent framing. Returns an array of rings in canvas space,
   * main ring first.
   */
  normalizeRingsToCanvas(rings, padding = 40) {
    return normalizeRingsToCanvasPoints(rings, this.width, this.height, padding);
  }

  /**
   * Render a region's outline on the canvas
   * Used for trace mode background and comparison visualization
   */
  renderRegionOutline(path, options = {}) {
    const {
      color = '#5c4033',
      lineWidth = 2,
      lineDash = [],
      opacity = 1,
      fill = false,
      fillColor = 'rgba(200, 169, 81, 0.1)',
      padding = 40
    } = options;

    const scaledPath = this.normalizePathToCanvas(path, padding);
    if (scaledPath.length === 0) return;

    let drawPath = scaledPath;
    let shouldClose = true;

    if (options.hintPercent) {
      const hintLen = Math.max(2, Math.floor(scaledPath.length * options.hintPercent));
      drawPath = scaledPath.slice(0, hintLen);
      shouldClose = false;
    }

    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.setLineDash(lineDash);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    ctx.beginPath();
    ctx.moveTo(drawPath[0][0], drawPath[0][1]);
    for (let i = 1; i < drawPath.length; i++) {
      ctx.lineTo(drawPath[i][0], drawPath[i][1]);
    }
    
    if (shouldClose && options.close !== false) {
      ctx.closePath();
    }

    if (fill) {
      ctx.fillStyle = fillColor;
      ctx.fill();
    }
    ctx.stroke();
    ctx.restore();
  }

  /**
   * Multi-part version of renderRegionOutline (#18) — draws every ring of
   * `region.rings` (falls back to `[region.path]` for older/single-ring
   * data), fit together with one shared scale so islands sit correctly
   * relative to the mainland. `hintPercent` (blind-mode hint) only ever
   * reveals a fraction of the FIRST (main) ring — a hint shouldn't give
   * away island shapes the player hasn't attempted yet.
   */
  renderRegionRings(rings, options = {}) {
    const {
      color = '#5c4033',
      lineWidth = 2,
      lineDash = [],
      opacity = 1,
      fill = false,
      fillColor = 'rgba(200, 169, 81, 0.1)',
      padding = 40,
    } = options;

    const scaledRings = this.normalizeRingsToCanvas(rings, padding);
    if (scaledRings.length === 0) return;

    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.setLineDash(lineDash);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    if (fill) ctx.fillStyle = fillColor;

    scaledRings.forEach((ring, i) => {
      let drawRing = ring;
      let shouldClose = true;

      if (options.hintPercent) {
        if (i > 0) return; // hint never reveals islands, only the main ring
        const hintLen = Math.max(2, Math.floor(ring.length * options.hintPercent));
        drawRing = ring.slice(0, hintLen);
        shouldClose = false;
      } else if (i > 0 && visibleRingFraction(ring, this.width, this.height) < 0.5) {
        // Skip an island that's mostly off-canvas (its fit is anchored to
        // the main ring alone, so it renders wherever that puts it) —
        // drawing just the sliver that pokes on-screen looks like a
        // rendering glitch, not a recognizable island. The main ring (i===0)
        // is never culled this way.
        return;
      }

      ctx.beginPath();
      ctx.moveTo(drawRing[0][0], drawRing[0][1]);
      for (let p = 1; p < drawRing.length; p++) {
        ctx.lineTo(drawRing[p][0], drawRing[p][1]);
      }
      if (shouldClose && options.close !== false) ctx.closePath();
      if (fill) ctx.fill();
      ctx.stroke();
    });

    ctx.restore();
  }

  /**
   * Render the filled region on an offscreen canvas for IoU comparison
   * Returns the offscreen canvas with the region filled in black
   */
  renderFilledRegion(path, padding = 40) {
    const offscreen = document.createElement('canvas');
    offscreen.width = this.canvas.width;
    offscreen.height = this.canvas.height;
    const offCtx = offscreen.getContext('2d');
    offCtx.scale(this.dpr, this.dpr);

    const scaledPath = this.normalizePathToCanvas(path, padding);
    if (scaledPath.length === 0) return offscreen;

    offCtx.fillStyle = '#000000';
    offCtx.beginPath();
    offCtx.moveTo(scaledPath[0][0], scaledPath[0][1]);
    for (let i = 1; i < scaledPath.length; i++) {
      offCtx.lineTo(scaledPath[i][0], scaledPath[i][1]);
    }
    offCtx.closePath();
    offCtx.fill();

    return offscreen;
  }

  destroy() {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
    if (this.canvas.parentNode) {
      this.canvas.parentNode.removeChild(this.canvas);
    }
  }
}
