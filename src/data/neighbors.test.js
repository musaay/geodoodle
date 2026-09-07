import { describe, it, expect } from 'vitest';
import { NEIGHBORS, getNeighbors, nextChainRegion } from './neighbors.js';
import { getAllRegions } from './levels.js';

const allIds = new Set(getAllRegions().map((r) => r.id));

describe('NEIGHBORS table', () => {
  it('every key is a valid region id', () => {
    for (const id of Object.keys(NEIGHBORS)) {
      expect(allIds.has(id)).toBe(true);
    }
  });

  it('every listed neighbor id is a valid region id', () => {
    for (const neighbors of Object.values(NEIGHBORS)) {
      for (const id of neighbors) {
        expect(allIds.has(id)).toBe(true);
      }
    }
  });

  it('covers all 65 regions (a key, even if its list is empty)', () => {
    for (const id of allIds) {
      expect(Object.prototype.hasOwnProperty.call(NEIGHBORS, id)).toBe(true);
    }
  });

  it('never lists a region as its own neighbor', () => {
    for (const [id, neighbors] of Object.entries(NEIGHBORS)) {
      expect(neighbors).not.toContain(id);
    }
  });
});

describe('getNeighbors', () => {
  it('symmetrizes the table: if A lists B, getNeighbors(B) includes A', () => {
    for (const id of allIds) {
      for (const neighbor of getNeighbors(id)) {
        expect(getNeighbors(neighbor)).toContain(id);
      }
    }
  });

  it('returns an empty array for an unknown id', () => {
    expect(getNeighbors('not-a-real-region')).toEqual([]);
  });

  it('returns known real neighbors, e.g. turkey <-> greece', () => {
    expect(getNeighbors('turkey')).toContain('greece');
    expect(getNeighbors('greece')).toContain('turkey');
  });
});

describe('nextChainRegion', () => {
  // Minimal fake region map — enough to exercise resolver logic without the
  // full data files (unrelated to the real hand-maintained NEIGHBORS table).
  // Only metadata (category/centroid) is needed — #20 follow-up.
  const regionsById = {
    a: { id: 'a', category: 'country', centroid: { x: 0, y: 0 } },
    b: { id: 'b', category: 'country', centroid: { x: 1, y: 0 } },
    c: { id: 'c', category: 'country', centroid: { x: 10, y: 0 } },
    d: { id: 'd', category: 'country', centroid: { x: 10.5, y: 0 } },
    e: { id: 'e', category: 'province', centroid: { x: 0, y: 0 } }, // different category
  };

  it('falls back to the nearest unplayed same-category region when neighbors are exhausted/unknown', () => {
    // 'a' has no entry in the real NEIGHBORS table (fake id), so it always
    // falls back to nearest-by-centroid within the same category.
    const result = nextChainRegion('a', ['a'], regionsById);
    expect(result).toBe('b'); // closest unplayed country to (0,0) is b (1,0), not c/d
  });

  it('skips already-played regions in the fallback', () => {
    const result = nextChainRegion('a', ['a', 'b'], regionsById);
    expect(result).toBe('c');
  });

  it('never falls back across categories', () => {
    const onlyOtherCategoryLeft = { a: regionsById.a, e: regionsById.e };
    const result = nextChainRegion('a', ['a'], onlyOtherCategoryLeft);
    expect(result).toBeNull();
  });

  it('returns null when nothing unplayed is left', () => {
    const result = nextChainRegion('a', ['a', 'b', 'c', 'd'], regionsById);
    expect(result).toBeNull();
  });

  it('returns null for an unknown current region with nothing to fall back on', () => {
    expect(nextChainRegion('not-a-real-region', [], {})).toBeNull();
  });

  it('resolves an unplayed neighbor before ever considering the fallback (real data)', () => {
    // turkey's real neighbors are greece and bulgaria; with both unplayed the
    // resolver must return one of them, not some distant fallback country.
    const real = Object.fromEntries(getAllRegions().map((r) => [r.id, r]));
    const result = nextChainRegion('turkey', ['turkey'], real);
    expect(['greece', 'bulgaria']).toContain(result);
  });
});
