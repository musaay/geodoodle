import { describe, it, expect } from 'vitest';
import { getDailyRegionId, computeStreak, todayStr, getDailyRegionPool } from './daily.js';

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
