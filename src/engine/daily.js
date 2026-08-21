import { levels } from '../data/levels.js';

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

/** Deterministic pick: same dateStr + pool -> same region id for everyone. */
export function getDailyRegionId(dateStr, regionIds) {
  if (!regionIds || regionIds.length === 0) return null;
  let h = 0;
  for (let i = 0; i < dateStr.length; i++) {
    h = (h * 31 + dateStr.charCodeAt(i)) >>> 0;
  }
  return regionIds[h % regionIds.length];
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
