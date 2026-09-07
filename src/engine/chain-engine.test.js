import { describe, it, expect } from 'vitest';
import {
  nextMultiplier, linkValue, shouldEndChain, chainTotal,
  createChain, applyChainLink,
  CHAIN_START_MULTIPLIER, CHAIN_MULTIPLIER_CAP,
} from './chain-engine.js';

describe('nextMultiplier', () => {
  it('steps up by 0.1', () => {
    expect(nextMultiplier(1.0)).toBe(1.1);
    expect(nextMultiplier(1.1)).toBeCloseTo(1.2, 5);
  });

  it('caps at 2.0 and never exceeds it', () => {
    expect(nextMultiplier(1.9)).toBe(2.0);
    expect(nextMultiplier(2.0)).toBe(2.0);
  });

  it('avoids floating point drift over many steps', () => {
    let m = CHAIN_START_MULTIPLIER;
    for (let i = 0; i < 20; i++) m = nextMultiplier(m);
    expect(m).toBe(CHAIN_MULTIPLIER_CAP);
  });
});

describe('linkValue', () => {
  it('rounds score * multiplier to the nearest whole number', () => {
    expect(linkValue(80, 1.0)).toBe(80);
    expect(linkValue(80, 1.1)).toBe(88);
    expect(linkValue(75, 1.25)).toBe(94); // 93.75 -> 94
  });
});

describe('shouldEndChain', () => {
  it('ends below the Explorer threshold (40)', () => {
    expect(shouldEndChain(39)).toBe(true);
    expect(shouldEndChain(0)).toBe(true);
  });

  it('continues at or above the threshold', () => {
    expect(shouldEndChain(40)).toBe(false);
    expect(shouldEndChain(100)).toBe(false);
  });
});

describe('chainTotal', () => {
  it('sums link values', () => {
    expect(chainTotal([{ value: 10 }, { value: 20 }, { value: 5 }])).toBe(35);
  });

  it('is 0 for an empty chain', () => {
    expect(chainTotal([])).toBe(0);
  });
});

describe('applyChainLink', () => {
  it('appends a link, grows the multiplier, and keeps the chain active on a good score with a next region', () => {
    const chain = createChain('trace');
    const updated = applyChainLink(chain, 'turkey', 80, 'greece');

    expect(updated.active).toBe(true);
    expect(updated.links).toEqual([{ region: 'turkey', score: 80, value: 80 }]);
    expect(updated.total).toBe(80);
    expect(updated.multiplier).toBeCloseTo(1.1, 5);
    expect(updated.nextRegionId).toBe('greece');
    // Original chain is untouched.
    expect(chain.links).toEqual([]);
  });

  it('uses the multiplier active AT THE TIME of the link, not the updated one', () => {
    let chain = createChain('trace');
    chain = applyChainLink(chain, 'a', 100, 'b'); // multiplier 1.0 -> value 100, now 1.1
    chain = applyChainLink(chain, 'b', 100, 'c'); // multiplier 1.1 -> value 110, now 1.2
    expect(chain.links.map((l) => l.value)).toEqual([100, 110]);
    expect(chain.total).toBe(210);
  });

  it('ends the chain when the score drops below the threshold, even with a next region available', () => {
    const chain = createChain('trace');
    const updated = applyChainLink(chain, 'a', 30, 'b');
    expect(updated.active).toBe(false);
    expect(updated.nextRegionId).toBeNull();
    // Multiplier does not advance past a chain-ending link.
    expect(updated.multiplier).toBe(CHAIN_START_MULTIPLIER);
  });

  it('ends the chain when there is no next region, even with a good score', () => {
    const chain = createChain('trace');
    const updated = applyChainLink(chain, 'a', 90, null);
    expect(updated.active).toBe(false);
    expect(updated.nextRegionId).toBeNull();
    expect(updated.links).toEqual([{ region: 'a', score: 90, value: 90 }]);
  });
});
