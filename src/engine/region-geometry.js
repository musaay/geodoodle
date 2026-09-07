/**
 * Lazy per-region geometry loader (#20 follow-up). A playable region's
 * `path`/`rings`/neighbour-`context` no longer ship in the main bundle
 * (src/data/{countries,turkey-provinces,us-states}.js now carry only
 * metadata — id, name, difficulty, category, funFact, centroid) — they live
 * in their own chunk, `src/data/regions/<id>.js`, fetched at most once per
 * region per session and cached here.
 *
 * `import.meta.glob` (lazy, not eager) gives each region file its own Vite
 * chunk — visiting one region never pulls in every other region's geometry.
 */
const REGION_MODULES = import.meta.glob('../data/regions/*.js');

const cache = new Map();

/** Resolves to `{ path, rings, context, borders }` for `id`, or `null` if unknown. */
export function loadRegionGeometry(id) {
  if (!cache.has(id)) {
    const loader = REGION_MODULES[`../data/regions/${id}.js`];
    cache.set(id, loader ? loader().then((m) => m.geometry) : Promise.resolve(null));
  }
  return cache.get(id);
}
