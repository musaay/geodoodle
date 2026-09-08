/**
 * Pure view-model for the result screen's "More" row (#21) — Neighbor
 * Chain + Daily Triple entry points shown below the primary/secondary
 * buttons on a NORMAL round's result (never while a chain or daily set is
 * already active, since the primary button already drives that flow, and
 * never in 2-player mode, where both modes are single-player only).
 * DOM-free so the visibility/label logic is unit-testable without a screen.
 */

/**
 * @param {object} params
 * @param {boolean} params.isMultiplayer
 * @param {object|null} params.chainOutcome - ResultScreen's own chainOutcome (non-null = a chain round)
 * @param {object|null} params.dailyOutcome - ResultScreen's own dailyOutcome (non-null = a daily round)
 * @param {{ playedCount: number, isComplete: boolean }} params.dailyProgress - today's Daily Triple progress, independent of any active chain
 * @param {{ links: number, total: number }|null} params.bestChain
 * @returns {null | { showChain: true, bestChain: object|null, showDaily: boolean, dailyStarted: boolean, dailyPlayedCount: number }}
 *   `null` means the whole row is hidden. `dailyStarted` picks the daily
 *   card's wording: false ("nothing played yet today") reads as an
 *   invitation ("3 regions today"), true reads as completed-count progress
 *   ("2/3 done") — "0/3 done" read wrong before any region was played (#21
 *   follow-up).
 */
export function computeMoreRowState({ isMultiplayer, chainOutcome, dailyOutcome, dailyProgress, bestChain }) {
  if (isMultiplayer || chainOutcome || dailyOutcome) return null;
  return {
    showChain: true,
    bestChain: bestChain || null,
    showDaily: !dailyProgress.isComplete,
    dailyStarted: dailyProgress.playedCount > 0,
    dailyPlayedCount: dailyProgress.playedCount,
  };
}
