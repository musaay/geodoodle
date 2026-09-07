/**
 * Neighbor Chain (#15) scoring math — pure, DOM-free.
 *
 * Multiplier starts at 1.0 and grows by +0.1 for every COMPLETED link
 * (capped at 2.0); a link's point value is its raw score times the
 * multiplier that was active when it was played, rounded to a whole number.
 * The chain ends the moment a round scores below CHAIN_END_SCORE_THRESHOLD
 * (an independently-chosen cutoff, not derived from RANKS in data/levels.js
 * — it just happens to sit inside the Explorer range) or the neighbor
 * resolver has nothing left to offer.
 */
export const CHAIN_START_MULTIPLIER = 1.0;
export const CHAIN_MULTIPLIER_STEP = 0.1;
export const CHAIN_MULTIPLIER_CAP = 2.0;
export const CHAIN_END_SCORE_THRESHOLD = 40;

/** Multiplier for the NEXT link, after one more link completes. Capped at CHAIN_MULTIPLIER_CAP. */
export function nextMultiplier(currentMultiplier) {
  // Round to 1 decimal to avoid float drift (0.1 + 0.1 + ... in JS).
  return Math.min(CHAIN_MULTIPLIER_CAP, Math.round((currentMultiplier + CHAIN_MULTIPLIER_STEP) * 10) / 10);
}

/** Point value of one link: raw score × the multiplier active for that link. */
export function linkValue(score, multiplier) {
  return Math.round(score * multiplier);
}

/** Whether a round's score ends the chain (below the Explorer rank threshold). */
export function shouldEndChain(score) {
  return score < CHAIN_END_SCORE_THRESHOLD;
}

/** Sum of every link's value in a chain's `links` array ({ value } objects). */
export function chainTotal(links) {
  return links.reduce((sum, link) => sum + link.value, 0);
}

/**
 * Creates a fresh chain session object. `mode` is 'trace' | 'blind', fixed
 * for the whole chain. The starting region itself isn't part of the chain
 * object — it's just the regionId passed to `app.startGame()` — the chain
 * only tracks completed links.
 */
export function createChain(mode) {
  return {
    active: true,
    mode,
    links: [],
    multiplier: CHAIN_START_MULTIPLIER,
    total: 0,
    nextRegionId: null,
  };
}

/**
 * Applies one completed round to a chain, returning a NEW chain object
 * (doesn't mutate `chain`) plus whether the chain should end.
 * `nextRegionId` is whatever nextChainRegion() resolved (or null).
 */
export function applyChainLink(chain, regionId, score, nextRegionId) {
  const value = linkValue(score, chain.multiplier);
  const links = [...chain.links, { region: regionId, score, value }];
  const ended = shouldEndChain(score) || nextRegionId == null;

  return {
    ...chain,
    active: !ended,
    links,
    total: chainTotal(links),
    multiplier: ended ? chain.multiplier : nextMultiplier(chain.multiplier),
    nextRegionId: ended ? null : nextRegionId,
  };
}
