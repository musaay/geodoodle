import { describe, it, expect } from 'vitest';
import { isHighRank } from './audio-engine.js';
import { RANKS } from '../data/levels.js';

describe('isHighRank', () => {
  it('is true for the top 2 ranks by minScore (Map Master, Modern Piri Reis)', () => {
    expect(isHighRank(RANKS.MAP_MASTER)).toBe(true);
    expect(isHighRank(RANKS.PIRI_REIS)).toBe(true);
  });

  it('is false for the lower ranks', () => {
    expect(isHighRank(RANKS.EXPLORER)).toBe(false);
    expect(isHighRank(RANKS.CARTOGRAPHER)).toBe(false);
  });

  it('is false for missing/invalid input', () => {
    expect(isHighRank(null)).toBe(false);
    expect(isHighRank(undefined)).toBe(false);
    expect(isHighRank({})).toBe(false);
  });
});
