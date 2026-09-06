import { levels } from '../data/levels.js';

/**
 * Resolves the "next region" target after a round finishes (issue #14).
 * Pure, DOM-free — takes an `isUnlocked(levelId)` predicate so callers can
 * test it without a real GameState.
 *
 * - Same section (level): the next region in that level's `regions` list,
 *   same mode.
 * - End of section: the first region of the next level (in `levels` array
 *   order) that `isUnlocked` accepts, skipping any locked ones in between.
 * - Nothing left: `null` — callers should fall back to the level list.
 *
 * Returns `{ regionId, mode }` or `null`.
 */
export function resolveNextRegion(regionId, mode, isUnlocked) {
  const levelIndex = levels.findIndex((l) => l.mode === mode && l.regions.includes(regionId));
  if (levelIndex === -1) return null;

  const level = levels[levelIndex];
  const regionIndex = level.regions.indexOf(regionId);
  if (regionIndex < level.regions.length - 1) {
    return { regionId: level.regions[regionIndex + 1], mode };
  }

  for (let i = levelIndex + 1; i < levels.length; i++) {
    const next = levels[i];
    if (next.regions.length > 0 && isUnlocked(next.id)) {
      return { regionId: next.regions[0], mode: next.mode };
    }
  }

  return null;
}
