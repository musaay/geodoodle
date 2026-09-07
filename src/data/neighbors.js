/**
 * Neighbor Chain mode (#15) — hand-maintained adjacency table covering every
 * region id in countries.js, turkey-provinces.js and us-states.js.
 *
 * Real land borders wherever the two regions are both in our set; for
 * islands/isolated countries a sensible sea neighbour is added instead
 * (documented inline below). Turkish provinces and US states use ONLY real
 * adjacency among the subset we ship — many of them have none of their real
 * neighbors in our set and are deliberately left with an empty list; the
 * centroid fallback in `nextChainRegion` covers those.
 *
 * The table below is written directionally (each edge listed once, on
 * whichever side reads more naturally) and is symmetrized at load time by
 * `getNeighbors`/`nextChainRegion` — never read NEIGHBORS directly, since it
 * is NOT guaranteed symmetric as written.
 */
export const NEIGHBORS = {
  // --- Countries -----------------------------------------------------
  // Real land borders.
  turkey: ['greece', 'bulgaria'],
  italy: ['france', 'switzerland'],
  france: ['germany', 'italy', 'spain', 'switzerland'],
  germany: ['france', 'poland', 'switzerland', 'czechia'],
  india: ['china'],
  spain: ['france', 'portugal'],
  romania: ['bulgaria', 'hungary', 'ukraine'],
  bulgaria: ['romania', 'greece', 'turkey'],
  hungary: ['romania', 'ukraine'],
  poland: ['germany', 'czechia', 'ukraine'],
  czechia: ['germany', 'poland'],
  usa: ['canada', 'mexico'],
  canada: ['usa'],
  mexico: ['usa'],
  argentina: ['chile', 'brazil'],
  brazil: ['argentina'],
  chile: ['argentina'],
  greece: ['bulgaria', 'turkey'],
  norway: ['sweden', 'finland'],
  portugal: ['spain'],
  sweden: ['norway', 'finland'],
  finland: ['sweden', 'norway'],
  ukraine: ['poland', 'romania', 'hungary'],
  china: ['india', 'vietnam'],
  vietnam: ['china'],
  switzerland: ['france', 'germany', 'italy'],
  // Real land border via the Republic of Ireland / Northern Ireland border.
  ireland: ['uk'],
  // Sea/near neighbours for otherwise-isolated countries.
  japan: ['south-korea'],
  'south-korea': ['japan'],
  uk: ['ireland', 'france'],
  egypt: ['saudi-arabia'], // Red Sea, narrow at the Gulf of Aqaba
  'saudi-arabia': ['egypt'],
  thailand: ['vietnam'], // Gulf of Thailand
  // Genuinely isolated within our set — centroid fallback handles these.
  australia: [],
  'south-africa': [],

  // --- Turkish provinces (real adjacency only) ------------------------
  ankara: ['kirsehir', 'konya', 'bolu'],
  antalya: ['mugla', 'burdur', 'konya'],
  konya: ['ankara', 'antalya'],
  adana: ['kayseri'],
  samsun: ['tokat', 'sinop'],
  mugla: ['antalya', 'burdur'],
  kayseri: ['kirsehir', 'adana'],
  bolu: ['ankara'],
  tokat: ['samsun'],
  kirsehir: ['ankara', 'kayseri'],
  sinop: ['samsun'],
  burdur: ['antalya', 'mugla'],
  // No real neighbor within our 20-province set — centroid fallback.
  istanbul: [],
  izmir: [],
  trabzon: [],
  hatay: [],
  van: [],
  bursa: [],
  erzurum: [],
  diyarbakir: [],

  // --- US states (real adjacency only) --------------------------------
  texas: ['oklahoma'],
  california: ['nevada'],
  colorado: ['oklahoma', 'utah'],
  utah: ['idaho', 'colorado', 'nevada'],
  nevada: ['idaho', 'utah', 'california'],
  idaho: ['washington', 'utah', 'nevada'],
  washington: ['idaho'],
  oklahoma: ['texas', 'colorado'],
  // No real neighbor within our 10-state set — centroid fallback.
  florida: [],
  'new-york': [],
};

/** Builds a fully symmetric adjacency map (Map<id, Set<id>>) from NEIGHBORS. */
function buildSymmetricMap() {
  const map = new Map();
  const add = (a, b) => {
    if (!map.has(a)) map.set(a, new Set());
    map.get(a).add(b);
  };
  for (const [id, neighbors] of Object.entries(NEIGHBORS)) {
    if (!map.has(id)) map.set(id, new Set());
    for (const other of neighbors) {
      add(id, other);
      add(other, id);
    }
  }
  return map;
}

// Built once — NEIGHBORS is a static, hand-maintained table.
const SYMMETRIC_MAP = buildSymmetricMap();

/** Returns the symmetrized neighbor ids of `id` (empty array if none/unknown). */
export function getNeighbors(id) {
  const set = SYMMETRIC_MAP.get(id);
  return set ? Array.from(set) : [];
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Resolves the next region in a Neighbor Chain (#15).
 *
 * - Prefers a random unplayed neighbour of `currentId`.
 * - Falls back to the nearest unplayed region (by centroid) within the
 *   same category (country/province/state) as `currentId`.
 * - Returns `null` when nothing unplayed is left in either pool.
 *
 * `playedIds` is any iterable of ids already used in this chain (current
 * region included) — pure and DOM-free; `regionsById` is a plain
 * `{ [id]: region }` map so callers/tests don't need the real data files.
 * Only METADATA is needed here (`category`, `centroid`) — #20 follow-up
 * moved full geometry (`path`/`rings`) out of the main bundle into a lazy
 * per-region chunk, so chain resolution reads the cheap, always-in-memory
 * `centroid` field instead of ever needing to load geometry just to rank
 * regions by rough distance.
 */
export function nextChainRegion(currentId, playedIds, regionsById) {
  const played = new Set(playedIds);

  const unplayedNeighbors = getNeighbors(currentId).filter(
    (id) => regionsById[id] && !played.has(id)
  );
  if (unplayedNeighbors.length > 0) {
    return unplayedNeighbors[Math.floor(Math.random() * unplayedNeighbors.length)];
  }

  const current = regionsById[currentId];
  if (!current?.centroid) return null;

  let nearestId = null;
  let nearestDist = Infinity;
  for (const [id, region] of Object.entries(regionsById)) {
    if (id === currentId || played.has(id)) continue;
    if (region.category !== current.category) continue;
    if (!region.centroid) continue;
    const d = distance(current.centroid, region.centroid);
    if (d < nearestDist) {
      nearestDist = d;
      nearestId = id;
    }
  }
  return nearestId;
}
