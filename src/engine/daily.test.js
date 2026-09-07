import { describe, it, expect } from 'vitest';
import {
  getDailyRegionId, computeStreak, todayStr, getDailyRegionPool,
  getDailyRegionIds, normalizeDailyEntry, getDailyProgress,
} from './daily.js';

describe('getDailyRegionPool', () => {
  it('returns a non-empty, deduped list of region ids', () => {
    const pool = getDailyRegionPool();
    expect(pool.length).toBeGreaterThan(0);
    expect(new Set(pool).size).toBe(pool.length);
  });
});

describe('getDailyRegionId', () => {
  const pool = ['a', 'b', 'c', 'd', 'e'];

  it('is deterministic: same date + pool -> same id', () => {
    const first = getDailyRegionId('2026-08-21', pool);
    const second = getDailyRegionId('2026-08-21', pool);
    expect(first).toBe(second);
  });

  it('always returns a member of the pool', () => {
    for (let d = 1; d <= 28; d++) {
      const dateStr = `2026-01-${String(d).padStart(2, '0')}`;
      expect(pool).toContain(getDailyRegionId(dateStr, pool));
    }
  });

  it('spreads picks across the pool for different dates', () => {
    const picks = new Set();
    for (let d = 1; d <= 28; d++) {
      const dateStr = `2026-01-${String(d).padStart(2, '0')}`;
      picks.add(getDailyRegionId(dateStr, pool));
    }
    // With 28 dates over a 5-item pool, expect more than one distinct pick
    expect(picks.size).toBeGreaterThan(1);
  });

  it('returns null for an empty pool', () => {
    expect(getDailyRegionId('2026-08-21', [])).toBe(null);
  });
});

describe('getDailyRegionIds', () => {
  // Fake pool + resolver so this is independent of the real data files.
  const pool = ['e1', 'e2', 'm1', 'm2', 'h1', 'h2', 'x1'];
  const difficultyOf = {
    e1: 'easy', e2: 'easy', m1: 'medium', m2: 'medium', h1: 'hard', h2: 'hard', x1: undefined,
  };
  const resolveRegion = (id) => ({ difficulty: difficultyOf[id] });

  it('returns `count` distinct ids, all from the pool', () => {
    const ids = getDailyRegionIds('2026-08-21', pool, 3, resolveRegion);
    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(3);
    for (const id of ids) expect(pool).toContain(id);
  });

  it('is deterministic: same date + pool -> same set', () => {
    const first = getDailyRegionIds('2026-08-21', pool, 3, resolveRegion);
    const second = getDailyRegionIds('2026-08-21', pool, 3, resolveRegion);
    expect(second).toEqual(first);
  });

  it('mixes difficulty when all three are available: one easy, one medium, one hard', () => {
    for (let d = 1; d <= 15; d++) {
      const dateStr = `2026-02-${String(d).padStart(2, '0')}`;
      const ids = getDailyRegionIds(dateStr, pool, 3, resolveRegion);
      const difficulties = ids.map((id) => difficultyOf[id]).sort();
      expect(difficulties).toEqual(['easy', 'hard', 'medium']);
    }
  });

  it('spreads picks across dates rather than always choosing the same trio', () => {
    const sets = new Set();
    for (let d = 1; d <= 20; d++) {
      const dateStr = `2026-03-${String(d).padStart(2, '0')}`;
      sets.add(getDailyRegionIds(dateStr, pool, 3, resolveRegion).slice().sort().join(','));
    }
    expect(sets.size).toBeGreaterThan(1);
  });

  it('falls back to the full pool when a difficulty bucket is exhausted or missing', () => {
    // Only two distinct difficulties present — the 3rd slot must still fill from the pool.
    const twoDifficulties = { a: 'easy', b: 'easy', c: 'medium' };
    const resolve = (id) => ({ difficulty: twoDifficulties[id] });
    const ids = getDailyRegionIds('2026-08-21', ['a', 'b', 'c'], 3, resolve);
    expect(ids).toHaveLength(3);
    expect(new Set(ids)).toEqual(new Set(['a', 'b', 'c']));
  });

  it('returns fewer than `count` if the pool itself is smaller', () => {
    const ids = getDailyRegionIds('2026-08-21', ['e1', 'e2'], 3, resolveRegion);
    expect(ids).toHaveLength(2);
  });

  it('returns an empty array for an empty pool', () => {
    expect(getDailyRegionIds('2026-08-21', [], 3, resolveRegion)).toEqual([]);
  });

  it('works against the real region data (integration smoke test)', () => {
    const ids = getDailyRegionIds('2026-08-21', getDailyRegionPool(), 3);
    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(3);
  });
});

describe('normalizeDailyEntry', () => {
  it('returns null for a missing entry', () => {
    expect(normalizeDailyEntry(undefined)).toBeNull();
    expect(normalizeDailyEntry(null)).toBeNull();
  });

  it('passes through the current shape unchanged', () => {
    const entry = { scores: { turkey: 80, italy: 60 }, total: 140 };
    expect(normalizeDailyEntry(entry)).toBe(entry);
  });

  it('migrates the pre-#17 single-region shape', () => {
    expect(normalizeDailyEntry({ regionId: 'turkey', score: 72 })).toEqual({
      scores: { turkey: 72 },
      total: 72,
    });
  });
});

describe('getDailyProgress', () => {
  const regionIds = ['turkey', 'italy', 'japan'];

  it('reports zero progress for a null entry', () => {
    expect(getDailyProgress(null, regionIds)).toEqual({
      playedCount: 0, total: 0, isComplete: false, nextRegionId: 'turkey',
    });
  });

  it('reports partial progress and the next unplayed region', () => {
    const entry = { scores: { turkey: 80 }, total: 80 };
    expect(getDailyProgress(entry, regionIds)).toEqual({
      playedCount: 1, total: 80, isComplete: false, nextRegionId: 'italy',
    });
  });

  it('reports completion once every region has a score', () => {
    const entry = { scores: { turkey: 80, italy: 60, japan: 91 }, total: 231 };
    expect(getDailyProgress(entry, regionIds)).toEqual({
      playedCount: 3, total: 231, isComplete: true, nextRegionId: null,
    });
  });

  it('only sums scores for the given regionIds, ignoring extras on the entry', () => {
    const entry = { scores: { turkey: 80, 'not-in-set': 999 }, total: 80 };
    expect(getDailyProgress(entry, regionIds).total).toBe(80);
  });
});

describe('todayStr', () => {
  it('returns a YYYY-MM-DD formatted string', () => {
    expect(todayStr()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('computeStreak', () => {
  it('returns 0 for no played dates', () => {
    expect(computeStreak([], '2026-08-21')).toBe(0);
  });

  it('counts today when today was played', () => {
    expect(computeStreak(['2026-08-21'], '2026-08-21')).toBe(1);
  });

  it('counts consecutive days ending today', () => {
    const played = ['2026-08-19', '2026-08-20', '2026-08-21'];
    expect(computeStreak(played, '2026-08-21')).toBe(3);
  });

  it('a gap breaks the streak', () => {
    const played = ['2026-08-17', '2026-08-19', '2026-08-20', '2026-08-21'];
    expect(computeStreak(played, '2026-08-21')).toBe(3);
  });

  it('keeps the streak alive if today is unplayed but yesterday was played', () => {
    const played = ['2026-08-19', '2026-08-20'];
    expect(computeStreak(played, '2026-08-21')).toBe(2);
  });

  it('returns 0 if neither today nor yesterday was played', () => {
    const played = ['2026-08-18'];
    expect(computeStreak(played, '2026-08-21')).toBe(0);
  });
});
