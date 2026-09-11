import { describe, it, expect } from 'vitest';
import {
  pickRunRegions, RUN_LENGTH, RUN_DIFFICULTY_LADDER,
  formatRunHud, RUN_HUD_NARROW_BREAKPOINT_PX,
} from './run-engine.js';

const REGIONS = [
  { id: 'e1', difficulty: 'easy' },
  { id: 'e2', difficulty: 'easy' },
  { id: 'e3', difficulty: 'easy' },
  { id: 'm1', difficulty: 'medium' },
  { id: 'm2', difficulty: 'medium' },
  { id: 'm3', difficulty: 'medium' },
  { id: 'h1', difficulty: 'hard' },
  { id: 'h2', difficulty: 'hard' },
];

// Deterministic "random": always picks the first (index 0) option, so
// results are stable and easy to reason about across tests.
const alwaysFirst = () => 0;

describe('pickRunRegions', () => {
  it('returns RUN_LENGTH regions following the difficulty ladder', () => {
    const picked = pickRunRegions(REGIONS, [], alwaysFirst);
    expect(picked).toHaveLength(RUN_LENGTH);
    expect(RUN_DIFFICULTY_LADDER).toEqual(['easy', 'easy', 'medium', 'medium', 'hard']);
  });

  it('never repeats a region within one run', () => {
    const picked = pickRunRegions(REGIONS, [], alwaysFirst);
    expect(new Set(picked).size).toBe(picked.length);
  });

  it('picks distinct easy regions for the first two rungs even with a fixed RNG', () => {
    const picked = pickRunRegions(REGIONS, [], alwaysFirst);
    // Both easy rungs must resolve to different ids despite `alwaysFirst`
    // always choosing index 0 — pickFrom filters already-picked ids out of
    // the pool before indexing, so the second easy pick is forced to be a
    // different region.
    expect(picked[0]).not.toBe(picked[1]);
    expect(['e1', 'e2', 'e3']).toContain(picked[0]);
    expect(['e1', 'e2', 'e3']).toContain(picked[1]);
  });

  it('excludes the previous run\'s regions when the pool allows it', () => {
    const picked = pickRunRegions(REGIONS, ['e1', 'e2'], alwaysFirst);
    expect(picked).not.toContain('e1');
    expect(picked).not.toContain('e2');
  });

  it('falls back to the nearest tier when a difficulty bucket is empty', () => {
    const noHard = REGIONS.filter((r) => r.difficulty !== 'hard');
    const picked = pickRunRegions(noHard, [], alwaysFirst);
    expect(picked).toHaveLength(RUN_LENGTH);
    // The 5th rung (hard) must have fallen back to medium or easy instead
    // of coming up short.
    const fifthRegion = noHard.find((r) => r.id === picked[4]);
    expect(fifthRegion).toBeTruthy();
    expect(['easy', 'medium']).toContain(fifthRegion.difficulty);
  });

  it('falls back past excludeIds rather than ending a run short', () => {
    // Only 4 distinct regions exist total, and 2 of them (the only easy
    // ones) are excluded — the no-repeats-within-this-run rule still uses
    // every distinct region available (dropping the exclude list once tier
    // fallback alone can't fill a rung) rather than leaving rungs empty.
    const tinyPool = [
      { id: 'e1', difficulty: 'easy' },
      { id: 'e2', difficulty: 'easy' },
      { id: 'm1', difficulty: 'medium' },
      { id: 'h1', difficulty: 'hard' },
    ];
    const picked = pickRunRegions(tinyPool, ['e1', 'e2'], alwaysFirst);
    expect(picked).toHaveLength(tinyPool.length);
    expect(new Set(picked)).toEqual(new Set(['e1', 'e2', 'm1', 'h1']));
  });

  it('returns fewer than RUN_LENGTH only when the combined pool is smaller', () => {
    const tiny = [{ id: 'only-one', difficulty: 'easy' }];
    const picked = pickRunRegions(tiny, [], alwaysFirst);
    expect(picked).toEqual(['only-one']);
  });

  it('returns an empty array for an empty pool', () => {
    expect(pickRunRegions([], [], alwaysFirst)).toEqual([]);
  });

  it('is deterministic for a given random source', () => {
    const seq = [0.1, 0.9, 0.2, 0.8, 0.5];
    let i = 0;
    const seeded = () => seq[i++ % seq.length];
    const a = pickRunRegions(REGIONS, [], seeded);
    i = 0;
    const b = pickRunRegions(REGIONS, [], seeded);
    expect(a).toEqual(b);
  });
});

describe('formatRunHud', () => {
  it('uses the short (word-free) key below the narrow breakpoint', () => {
    const { key, params } = formatRunHud({ index: 2, total: 184, viewportWidth: RUN_HUD_NARROW_BREAKPOINT_PX - 1 });
    expect(key).toBe('run_hud_short');
    expect(params).toEqual({ index: 2, total: 184 });
  });

  it('uses the long key at and above the narrow breakpoint', () => {
    expect(formatRunHud({ index: 2, total: 184, viewportWidth: RUN_HUD_NARROW_BREAKPOINT_PX }).key).toBe('run_hud_long');
    expect(formatRunHud({ index: 2, total: 184, viewportWidth: RUN_HUD_NARROW_BREAKPOINT_PX + 200 }).key).toBe('run_hud_long');
  });

  it('passes index/total through unchanged, as-is (1-based index, no rounding)', () => {
    const { params } = formatRunHud({ index: 5, total: 428, viewportWidth: 1280 });
    expect(params).toEqual({ index: 5, total: 428 });
  });
});
