import { normalizeRingsToCanvasPoints, clipPolygonToRect } from './canvas-manager.js';

// Re-exported for backward compat — callers/tests that import this from
// context-renderer.js (its original home) keep working; canvas-manager.js
// is now the canonical source since it also needs it for island culling.
export { clipPolygonToRect };
import { getLanguage } from '../i18n.js';

/**
 * Neighbour context (#18) — a static, cached background layer styled after
 * Google Maps' "silver" look (flat grey land/water, crisp white borders,
 * small grey neighbour labels) drawn BEHIND a region's own outline in trace
 * mode and the result overlay. Never shown in blind mode (callers simply
 * don't call this there).
 *
 * Context geometry is a coarse, decorative dataset per category — every
 * OTHER country/province/state in that category's full source data, not
 * just the ones we ship as playable regions (see scripts/generate_geo_data.js
 * buildContextModule). Each category's data is its own dynamic import, so
 * it lands in its own chunk and is fetched at most once per category, only
 * when a trace/result screen actually needs it — never in blind mode, and
 * never bloating the main bundle.
 */

const CONTEXT_LOADERS = {
  country: () => import('../data/context/countries-context.js').then((m) => m.countriesContext),
  province: () => import('../data/context/provinces-context.js').then((m) => m.provincesContext),
  state: () => import('../data/context/states-context.js').then((m) => m.statesContext),
};

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

// category -> Promise<entries[]>, loaded/decoded at most once per category per session.
const contextDataCache = new Map();
function loadContextData(category) {
  const loader = CONTEXT_LOADERS[category];
  if (!loader) return Promise.resolve(null);
  if (!contextDataCache.has(category)) contextDataCache.set(category, loader());
  return contextDataCache.get(category);
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
      const contextEntries = await loadContextData(region.category);
      if (!contextEntries || contextEntries.length === 0) return null;

      const padding = 40;
      const fitted = normalizeRingsToCanvasPoints(
        [region.path, ...contextEntries.map((e) => e.rings[0])],
        w, h, padding
      );
      const targetBBox = ringBBox(fitted[0]);
      const projectedContext = fitted.slice(1);

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

      // Context land — a soft coast edge (2.5px, muted grey) UNDER a crisp
      // 1px border, giving each shape a subtle outline without a real
      // shadow (no shadowBlur/offset — that read as "dirty" rather than flat).
      for (const ring of projectedContext) {
        if (ring.length < 3) continue;
        ctx.beginPath();
        ctx.moveTo(ring[0][0], ring[0][1]);
        for (let i = 1; i < ring.length; i++) ctx.lineTo(ring[i][0], ring[i][1]);
        ctx.closePath();
        ctx.fillStyle = palette.land;
        ctx.fill();
        ctx.strokeStyle = palette.coastEdge;
        ctx.lineWidth = 2.5;
        ctx.stroke();
        ctx.strokeStyle = palette.border;
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // Neighbour labels — gated on the shape's VISIBLE (canvas-clipped)
      // area, not its full extent: a big neighbour that runs off-canvas
      // (Russia next to a small target) still gets labeled, anchored at
      // the centroid of just the part actually on screen, rather than
      // being skipped or mislabeled at an off-screen/unrelated point.
      // Biggest visible shapes get first pick, simple overlap rejection
      // (grow a shared list of placed rects), never drawn over the target
      // (seeded into placedRects up front), and always nudged fully inside
      // a 6px margin — or dropped if it can't fit even centered.
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

      const placedRects = [targetBBox];
      for (const { entry, visible, bbox } of labelCandidates) {
        if (bbox.width < 36 || bbox.height < 18) continue;

        const name = isCountry ? regionDisplayName(entry.iso2, entry.name, lang) : entry.name;
        if (!name) continue;

        const textWidth = ctx.measureText(name).width;
        if (textWidth > bbox.width * 0.95) continue;

        const halfW = textWidth / 2 + 2;
        const halfH = 7;
        if (halfW * 2 > w - margin * 2 || halfH * 2 > h - margin * 2) continue; // can't fit even centered

        let [cx, cy] = ringCentroid(visible);
        cx = Math.min(w - margin - halfW, Math.max(margin + halfW, cx));
        cy = Math.min(h - margin - halfH, Math.max(margin + halfH, cy));

        const labelRect = { minX: cx - halfW, maxX: cx + halfW, minY: cy - halfH, maxY: cy + halfH };
        if (placedRects.some((r) => rectsOverlap(r, labelRect))) continue;

        ctx.fillText(name, cx, cy);
        placedRects.push(labelRect);
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
