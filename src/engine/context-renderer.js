import { normalizeRingsToCanvasPoints, clipPolygonToRect } from './canvas-manager.js';

// Re-exported for backward compat — callers/tests that import this from
// context-renderer.js (its original home) keep working; canvas-manager.js
// is now the canonical source since it also needs it for island culling.
export { clipPolygonToRect };
import { getLanguage } from '../i18n.js';

/**
 * Neighbour context (#18, rewritten per-region in #20) — a static, cached
 * background layer styled after Google Maps' "silver" look (flat grey
 * land/water, crisp white borders, small grey neighbour labels) drawn
 * BEHIND a region's own outline in trace mode and the result overlay. Never
 * shown in blind mode (callers simply don't call this there).
 *
 * Context geometry is generated per PLAYABLE REGION (see
 * scripts/generate_geo_data.js buildRegionContext) from a topology shared
 * with the target's own `path`/`rings` (buildCategoryTopology) — every
 * other feature from the same source category, clipped to the target's own
 * bbox (+50% each side). A context land polygon's own ring is used both for
 * its fill AND for its coastline stroke (coasts are never shared between
 * two features, so there's no vertex-coincidence risk there). Real shared
 * borders (province/province, country/country) are instead drawn from
 * `region.borders` — a pre-clipped slice of the whole category's shared
 * topology mesh (see buildCategoryBorders/clipCategoryBorders), drawn ON
 * TOP of each ring's own stroke: two adjacent polygons' own rings can each
 * carry an independently-digitized version of the same real border where
 * the raw source doesn't actually share vertices along that stretch (found
 * and verified in #20's report, across several Turkish province pairs and
 * at least one country pair) — the shared mesh line, being the exact same
 * arc for both sides, corrects that stretch on top of whatever the ring's
 * own (possibly slightly off) version drew underneath. A land-colored
 * buffer stroke under everything absorbs whatever hairline seam is left
 * where the two don't perfectly overlap. All of this ships merged into the
 * region's lazy geometry chunk (src/data/regions/<id>.js, loaded via
 * src/engine/region-geometry.js's `loadRegionGeometry`) — callers here
 * always pass an already-hydrated region (metadata + geometry merged),
 * never load anything themselves.
 */

const PALETTES = {
  day: {
    sea: '#F7F7F7',
    land: '#E6E6E6',
    border: '#FFFFFF',
    coastEdge: '#D6D6D6',
    label: '#7A7A80',
  },
  night: {
    sea: '#1E1E22',
    land: '#2A2A2E',
    border: '#3A3A40',
    coastEdge: '#3A3A40',
    label: '#9A9AA3',
  },
};

// Target region "selection" styling (#18 restyle) — Google-Maps-like flat
// fill + edge, shared by game-screen.js (trace mode) and result-screen.js
// (the result overlay) so both use the exact same colors per theme. No
// night variant was specified for this — the day blue read as much too
// bright/glaring against the dark palette (visibly wrong in an actual
// night-theme check), so this picks a muted navy that reads the same way
// relative to night's own land/water tones.
export function getTargetStyle(theme) {
  return theme === 'night'
    ? { fill: '#3A4A66', edge: '#5B7AAD' }
    : { fill: '#D9E3F2', edge: '#8FA8D0' };
}


// `${regionId}:${width}x${height}:${theme}:${lang}` -> Promise<canvas|null>
// — lang is part of the key because country labels are localized; a
// language toggle needs its own render, not the previous language's cached one.
const canvasCache = new Map();

// lang -> Intl.DisplayNames(region) instance, built at most once per language.
const displayNamesCache = new Map();
function regionDisplayName(iso2, fallbackName, lang) {
  // The source data has a handful of non-code placeholders (e.g. "-99" for
  // disputed/uninhabited territories) — skip the lookup outright for those
  // rather than throwing and catching a RangeError every time.
  if (!iso2 || !/^[A-Z]{2}$/.test(iso2)) return fallbackName;
  try {
    if (!displayNamesCache.has(lang)) {
      displayNamesCache.set(lang, new Intl.DisplayNames([lang], { type: 'region' }));
    }
    return displayNamesCache.get(lang).of(iso2) || fallbackName;
  } catch (e) {
    return fallbackName;
  }
}

export function ringCentroid(ring) {
  let cx = 0, cy = 0;
  for (const [x, y] of ring) { cx += x; cy += y; }
  return [cx / ring.length, cy / ring.length];
}

export function ringBBox(ring) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of ring) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

export function rectsOverlap(a, b) {
  return a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY;
}

/** Standard ray-casting point-in-polygon test (canvas [x, y] points). */
export function pointInPolygon([px, py], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersects = (yi > py) !== (yj > py)
      && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

/**
 * Builds (or returns the cached) offscreen canvas for `region` at
 * `width`x`height` for `theme`/current UI language — water, context land
 * with a soft coast edge under a crisp border, and neighbour labels.
 * Returns `null` if the category has no context data or the region has no
 * main ring; never throws.
 *
 * Render once per (region, size, theme, lang) and reuse: intended to be
 * drawn with a single `ctx.drawImage()` per frame from the caller, not
 * rebuilt on every draw — this is what keeps context rendering free of any
 * per-stroke cost on mobile.
 */
export async function getContextCanvas(region, width, height, theme) {
  if (!region?.path?.length || !width || !height) return null;
  const w = Math.round(width);
  const h = Math.round(height);
  const lang = getLanguage();
  const key = `${region.id}:${w}x${h}:${theme}:${lang}`;
  if (canvasCache.has(key)) return canvasCache.get(key);

  const promise = (async () => {
    try {
      const contextEntries = region.context;
      if (!contextEntries || contextEntries.length === 0) return null;

      // Shared-border mesh (#20 follow-up) — `region.borders` is the
      // category's shared topology mesh (scripts/generate_geo_data.js
      // buildCategoryBorders/clipCategoryBorders), pre-clipped to this
      // region's box at generation time: every arc shared between two
      // features (a real country/province/state border). Drawn on top of
      // each context ring's own stroke below (coastline never needs this —
      // it's never shared, see this file's own doc comment above).
      const interiorLines = region.borders || [];
      const padding = 40;
      const fitted = normalizeRingsToCanvasPoints(
        [region.path, ...contextEntries.map((e) => e.rings[0]), ...interiorLines],
        w, h, padding
      );
      const projectedContext = fitted.slice(1, 1 + contextEntries.length);
      const projectedInterior = fitted.slice(1 + contextEntries.length);

      // Rendered at device-pixel resolution (like CanvasManager itself) so
      // it isn't a blurry upscale on retina screens once drawImage()'d back
      // at CSS size by the caller.
      const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
      const canvas = document.createElement('canvas');
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      const ctx = canvas.getContext('2d');
      ctx.scale(dpr, dpr);
      const palette = PALETTES[theme] || PALETTES.day;

      // Water
      ctx.fillStyle = palette.sea;
      ctx.fillRect(0, 0, w, h);

      // Context land — filled, then given a thin land-colored buffer
      // stroke (see the comment above `interiorLines` for why an outline
      // is never stroked straight from a polygon's own ring in its OWN
      // color). The buffer stroke isn't decorative: two adjacent features'
      // rings can each carry an independently-digitized version of "the
      // same" real border where the source doesn't actually share exact
      // vertices, leaving a hairline sliver of background between their
      // two fills even with no wrong line drawn over it (found in #20's
      // report — removing the stroke fixed the WRONG LINE but left a
      // visible white hairline GAP instead, since the two fills' edges
      // still don't quite meet). A few-pixel land-colored stroke closes
      // that hairline without needing to reconcile the underlying
      // vertices — it's a couple of screen pixels, invisible anywhere the
      // fills already meet cleanly.
      //
      // The width is capped relative to the ring's OWN on-screen size —
      // a fixed 8px would visibly balloon/blob a small island that only
      // projects to a handful of pixels (a real case: Greece's smaller
      // Aegean islands), or bridge two genuinely separate small islands
      // sitting close together on canvas. Capping at a third of the
      // ring's shorter on-screen dimension keeps the buffer proportional
      // — plenty to close a hairline gap on a normal-sized landmass,
      // negligible (down to a single crisp px) on anything small.
      const MAX_LAND_BUFFER_WIDTH = 8;
      const strokeLines = (lines) => {
        for (const line of lines) {
          if (line.length < 2) continue;
          ctx.beginPath();
          ctx.moveTo(line[0][0], line[0][1]);
          for (let i = 1; i < line.length; i++) ctx.lineTo(line[i][0], line[i][1]);
          ctx.stroke();
        }
      };
      for (const ring of projectedContext) {
        if (ring.length < 3) continue;
        const bbox = ringBBox(ring);
        const bufferWidth = Math.max(1, Math.min(MAX_LAND_BUFFER_WIDTH, Math.min(bbox.width, bbox.height) / 3));
        ctx.beginPath();
        ctx.moveTo(ring[0][0], ring[0][1]);
        for (let i = 1; i < ring.length; i++) ctx.lineTo(ring[i][0], ring[i][1]);
        ctx.closePath();
        ctx.fillStyle = palette.land;
        ctx.fill();
        ctx.strokeStyle = palette.land;
        ctx.lineWidth = bufferWidth;
        ctx.lineJoin = 'round';
        ctx.stroke();

        // Coastline — a soft coast edge (2.5px, muted grey) UNDER a crisp
        // 1px border, straight from this ring's own (closed) outline. Never
        // shared with another feature, so no vertex-coincidence risk here —
        // unlike a real land border (see below), which this same stroke
        // also draws imprecisely along, then gets corrected on top.
        ctx.closePath();
        ctx.strokeStyle = palette.coastEdge;
        ctx.lineWidth = 2.5;
        ctx.stroke();
        ctx.strokeStyle = palette.border;
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // Real shared borders — drawn ON TOP of every context ring's own
      // stroke above, from the category's shared topology mesh (the exact
      // same arc on both sides of a real province/country border, see this
      // file's doc comment), correcting whatever imprecise version of that
      // stretch a context ring's own outline drew underneath.
      strokeLines(projectedInterior);

      // Neighbour labels — gated on the shape's VISIBLE (canvas-clipped)
      // area, not its full extent: a big neighbour that runs off-canvas
      // (Russia next to a small target) still gets labeled, anchored at
      // the centroid of just the part actually on screen, rather than
      // being skipped or mislabeled at an off-screen/unrelated point.
      // Biggest visible shapes get first pick, simple overlap rejection
      // (grow a shared list of placed rects) against other neighbours and a
      // precise point-in-polygon check against the target itself (see
      // below), always nudged fully inside a 6px margin — or dropped if it
      // can't fit even centered.
      const isCountry = region.category === 'country';
      const margin = 6;
      ctx.font = '12px Outfit, system-ui, sans-serif';
      ctx.fillStyle = palette.label;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const labelCandidates = contextEntries
        .map((entry, i) => ({ entry, ring: projectedContext[i] }))
        .filter((c) => c.ring && c.ring.length >= 3)
        .map((c) => ({ ...c, visible: clipPolygonToRect(c.ring, w, h) }))
        .filter((c) => c.visible.length >= 3)
        .map((c) => ({ ...c, bbox: ringBBox(c.visible) }))
        .sort((a, b) => (b.bbox.width * b.bbox.height) - (a.bbox.width * a.bbox.height));

      // Neighbour-vs-neighbour overlap still uses the cheap bounding-rect
      // check below (two placed neighbour labels rarely sit close enough
      // for the distinction to matter), but the TARGET itself is excluded
      // with a precise point-in-polygon test against its actual (usually
      // non-rectangular) shape, not `targetBBox`'s bounding rectangle — a
      // real regression found in #20's report: an irregularly-shaped target
      // (e.g. Kırşehir, roughly diamond-shaped) has "empty" grey corners
      // inside its own bbox rectangle that a neighbour's label can validly
      // sit in (Nevşehir's clipped, on-canvas area touches Kırşehir's
      // southeast corner without ever underlapping its actual fill) — the
      // coarse bbox check was rejecting those labels outright.
      const placedRects = [];
      // #20: a feature can now contribute several clipped pieces (a
      // mainland plus a few of its own islands, e.g. Greece) — only the
      // biggest gets a `name` from the generator, but guard here too so a
      // future duplicate can't print the same neighbour's name twice.
      const placedNames = new Set();
      for (const { entry, visible, bbox } of labelCandidates) {
        if (bbox.width < 36 || bbox.height < 18) continue;

        const name = isCountry ? regionDisplayName(entry.iso2, entry.name, lang) : entry.name;
        if (!name || placedNames.has(name)) continue;

        const textWidth = ctx.measureText(name).width;
        if (textWidth > bbox.width * 0.95) continue;

        const halfW = textWidth / 2 + 2;
        const halfH = 7;
        if (halfW * 2 > w - margin * 2 || halfH * 2 > h - margin * 2) continue; // can't fit even centered

        let [cx, cy] = ringCentroid(visible);
        cx = Math.min(w - margin - halfW, Math.max(margin + halfW, cx));
        cy = Math.min(h - margin - halfH, Math.max(margin + halfH, cy));

        const labelRect = { minX: cx - halfW, maxX: cx + halfW, minY: cy - halfH, maxY: cy + halfH };
        // Reject only if the label's actual TEXT BOX overlaps the target's
        // own filled shape (sampled at its center, 4 corners and 4 edge
        // midpoints — cheap, and enough to catch even a small jagged notch
        // poking into an edge) rather than the target's full bounding
        // RECTANGLE, which — for a non-rectangular target — falsely
        // excludes valid space in its "empty" bbox corners (#20's report:
        // Nevşehir's label, clear of Kırşehir's actual diamond-shaped fill,
        // was being rejected this way).
        const labelSamplePoints = [
          [cx, cy], [labelRect.minX, labelRect.minY], [labelRect.maxX, labelRect.minY],
          [labelRect.minX, labelRect.maxY], [labelRect.maxX, labelRect.maxY],
          [cx, labelRect.minY], [cx, labelRect.maxY], [labelRect.minX, cy], [labelRect.maxX, cy],
        ];
        if (labelSamplePoints.some((p) => pointInPolygon(p, fitted[0]))) continue;
        if (placedRects.some((r) => rectsOverlap(r, labelRect))) continue;

        ctx.fillText(name, cx, cy);
        placedRects.push(labelRect);
        placedNames.add(name);
      }

      return canvas;
    } catch (e) {
      // Context is decorative — never let a fetch/render hiccup break the
      // actual game screen behind it.
      return null;
    }
  })();

  canvasCache.set(key, promise);
  return promise;
}
