import { levels, getRegionById } from '../data/levels.js';

/**
 * Daily Challenge helpers - pure, DOM-free, deterministic.
 */

/** Flat, deduped, stable-order list of every region id referenced by any level. */
export function getDailyRegionPool() {
  const seen = new Set();
  const ids = [];
  for (const level of levels) {
    for (const regionId of level.regions) {
      if (!seen.has(regionId)) {
        seen.add(regionId);
        ids.push(regionId);
      }
    }
  }
  return ids;
}

/** Same hash used by every date-seeded pick below: same dateStr(+salt) -> same number for everyone. */
function hashStr(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) >>> 0;
  }
  return h;
}

/** Deterministic pick: same dateStr + pool -> same region id for everyone. */
export function getDailyRegionId(dateStr, regionIds) {
  if (!regionIds || regionIds.length === 0) return null;
  return regionIds[hashStr(dateStr) % regionIds.length];
}

/**
 * Daily Triple (#17): deterministically picks `count` DISTINCT region ids
 * for a date out of `regionIds`, same for everyone. Prefers a mixed set —
 * one easy, one medium, one hard, via `resolveRegion(id).difficulty` — and
 * fills any remaining slots (fewer than 3 difficulty buckets available, or
 * count > 3) from the full pool. `resolveRegion` defaults to the real
 * `getRegionById` but is injectable so this stays testable without the data
 * files (mirrors `resolveNextRegion`'s `isUnlocked` predicate pattern).
 *
 * Returns fewer than `count` ids only if the pool itself is smaller.
 */
export function getDailyRegionIds(dateStr, regionIds, count = 3, resolveRegion = getRegionById) {
  if (!regionIds || regionIds.length === 0) return [];
  const n = Math.min(count, regionIds.length);

  const buckets = { easy: [], medium: [], hard: [] };
  for (const id of regionIds) {
    const difficulty = resolveRegion(id)?.difficulty;
    if (buckets[difficulty]) buckets[difficulty].push(id);
  }

  const picked = [];
  const pickedSet = new Set();
  const pickFrom = (pool, salt) => {
    const filtered = pool.filter((id) => !pickedSet.has(id));
    if (filtered.length === 0) return null;
    return filtered[hashStr(`${dateStr}:${salt}`) % filtered.length];
  };

  for (const difficulty of ['easy', 'medium', 'hard']) {
    if (picked.length >= n) break;
    const id = pickFrom(buckets[difficulty], difficulty);
    if (id) {
      picked.push(id);
      pickedSet.add(id);
    }
  }

  let salt = 0;
  while (picked.length < n) {
    const remaining = regionIds.filter((id) => !pickedSet.has(id));
    if (remaining.length === 0) break;
    const id = remaining[hashStr(`${dateStr}:fill:${salt}`) % remaining.length];
    picked.push(id);
    pickedSet.add(id);
    salt++;
  }

  return picked;
}

/**
 * Normalizes a raw `daily[date]` entry to the current shape
 * `{ scores: { [regionId]: bestScore }, total }`, migrating the pre-#17
 * single-region shape `{ regionId, score }` on the fly. Returns `null` for
 * a missing/falsy entry.
 */
export function normalizeDailyEntry(raw) {
  if (!raw) return null;
  if (raw.scores) return raw;
  if (raw.regionId != null) {
    return { scores: { [raw.regionId]: raw.score }, total: raw.score };
  }
  return null;
}

/**
 * Progress of a normalized daily entry against today's `regionIds` set:
 * how many of them have a recorded score, the running total across just
 * those regions, whether all of them are done, and which one to play next
 * (or `null` once complete).
 */
export function getDailyProgress(entry, regionIds) {
  const scores = entry?.scores || {};
  const nextRegionId = regionIds.find((id) => scores[id] === undefined) ?? null;
  return {
    playedCount: regionIds.filter((id) => scores[id] !== undefined).length,
    total: regionIds.reduce((sum, id) => sum + (scores[id] || 0), 0),
    isComplete: nextRegionId === null,
    nextRegionId,
  };
}

/** Local-timezone 'YYYY-MM-DD' for right now. */
export function todayStr() {
  return formatDate(new Date());
}

function formatDate(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDateStr(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function addDays(date, delta) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + delta);
  return copy;
}

/**
 * Count of consecutive played days ending at todayDateStr, or ending at
 * yesterday if today hasn't been played yet (so an unplayed today doesn't
 * zero out a streak that's still alive).
 */
export function computeStreak(playedDates, todayDateStr) {
  const played = new Set(playedDates);
  let cursor = parseDateStr(todayDateStr);
  if (!played.has(formatDate(cursor))) {
    cursor = addDays(cursor, -1);
  }

  let streak = 0;
  while (played.has(formatDate(cursor))) {
    streak++;
    cursor = addDays(cursor, -1);
  }
  return streak;
}
