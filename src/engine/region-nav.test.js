import { describe, it, expect } from 'vitest';
import { resolveNextRegion } from './region-nav.js';
import { levels } from '../data/levels.js';

const alwaysUnlocked = () => true;
const neverUnlocked = () => false;

describe('resolveNextRegion', () => {
  it('returns the next region within the same section/mode', () => {
    // Level 1: trace, ['turkey', 'italy', 'japan', 'brazil', 'australia']
    expect(resolveNextRegion('turkey', 'trace', alwaysUnlocked)).toEqual({ regionId: 'italy', mode: 'trace' });
    expect(resolveNextRegion('italy', 'trace', alwaysUnlocked)).toEqual({ regionId: 'japan', mode: 'trace' });
  });

  it('moves to the first region of the next unlocked level at the end of a section', () => {
    // Last region of level 1 (trace) -> first region of level 2 (blind, same regions)
    expect(resolveNextRegion('australia', 'trace', alwaysUnlocked)).toEqual({ regionId: 'turkey', mode: 'blind' });
  });

  it('skips locked levels and picks the first region of the next unlocked one', () => {
    const level1 = levels.find((l) => l.id === 1);
    const lastRegion = level1.regions[level1.regions.length - 1];
    // Only unlock a level several sections ahead; everything in between must be skipped.
    const farAheadLevel = levels[levels.length - 1];
    const isUnlocked = (id) => id === farAheadLevel.id;
    expect(resolveNextRegion(lastRegion, level1.mode, isUnlocked)).toEqual({
      regionId: farAheadLevel.regions[0],
      mode: farAheadLevel.mode,
    });
  });

  it('returns null when no later level is unlocked', () => {
    const level1 = levels.find((l) => l.id === 1);
    const lastRegion = level1.regions[level1.regions.length - 1];
    expect(resolveNextRegion(lastRegion, level1.mode, neverUnlocked)).toBeNull();
  });

  it('returns null at the very end of the level list regardless of unlock state', () => {
    const lastLevel = levels[levels.length - 1];
    const lastRegion = lastLevel.regions[lastLevel.regions.length - 1];
    expect(resolveNextRegion(lastRegion, lastLevel.mode, alwaysUnlocked)).toBeNull();
  });

  it('returns null for a region/mode combination that matches no level', () => {
    expect(resolveNextRegion('turkey', 'blind-typo', alwaysUnlocked)).toBeNull();
    expect(resolveNextRegion('not-a-real-region', 'trace', alwaysUnlocked)).toBeNull();
  });

  it('disambiguates by mode when the same region id appears in both a trace and blind level', () => {
    // 'turkey' appears in level 1 (trace) and level 2 (blind), each with the same region order.
    const traceNext = resolveNextRegion('turkey', 'trace', alwaysUnlocked);
    const blindNext = resolveNextRegion('turkey', 'blind', alwaysUnlocked);
    expect(traceNext.mode).toBe('trace');
    expect(blindNext.mode).toBe('blind');
  });
});
