import { describe, it, expect } from 'vitest';
import { levels, getAllRegions, getRegionById } from './levels.js';
import { getDailyRegionPool, getDailyRegionId } from '../engine/daily.js';

describe('region data', () => {
  const regions = getAllRegions();

  it('has 65 regions across countries, provinces, and states (#3 content expansion)', () => {
    expect(regions.length).toBe(65);
  });

  it('has no duplicate ids', () => {
    const ids = regions.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every region has id/name/nameEn/funFact/funFactEn and a path of at least 20 points', () => {
    for (const region of regions) {
      expect(region.id, `${JSON.stringify(region.id)} id`).toBeTruthy();
      expect(region.name, `${region.id} name`).toBeTruthy();
      expect(region.nameEn, `${region.id} nameEn`).toBeTruthy();
      expect(region.funFact, `${region.id} funFact`).toBeTruthy();
      expect(region.funFactEn, `${region.id} funFactEn`).toBeTruthy();
      expect(Array.isArray(region.path), `${region.id} path`).toBe(true);
      expect(region.path.length, `${region.id} path length`).toBeGreaterThanOrEqual(20);
    }
  });
});

describe('levels', () => {
  it('every region id referenced by a level resolves via getRegionById', () => {
    for (const level of levels) {
      for (const regionId of level.regions) {
        expect(getRegionById(regionId), `level ${level.id} region "${regionId}"`).toBeTruthy();
      }
    }
  });

  it('has unique level ids', () => {
    const ids = levels.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('never requires more stars than the pre-existing max (32)', () => {
    for (const level of levels) {
      expect(level.requiredStars, `level ${level.id}`).toBeLessThanOrEqual(32);
    }
  });
});

describe('daily pool over the expanded region set', () => {
  it('getDailyRegionId is still deterministic for a fixed date', () => {
    const pool = getDailyRegionPool();
    expect(pool.length).toBeGreaterThan(0);
    const a = getDailyRegionId('2026-01-01', pool);
    const b = getDailyRegionId('2026-01-01', pool);
    expect(a).toBe(b);
    expect(getRegionById(a)).toBeTruthy();
  });
});
