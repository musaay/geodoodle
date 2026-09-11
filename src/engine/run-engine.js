/**
 * Sefer (Run) mode (#30) — pure, DOM-free region-ladder selection.
 * A run is 5 regions of escalating difficulty, played back-to-back without
 * visiting level select. Persistence/progression state lives in
 * game-state.js; this module only decides WHICH regions a fresh run gets.
 */

export const RUN_LENGTH = 5;

/** Difficulty ladder for a 5-region run — escalates, doesn't ramp mode. */
export const RUN_DIFFICULTY_LADDER = ['easy', 'easy', 'medium', 'medium', 'hard'];

// Below this viewport width the header HUD has no room for a word
// ("SEFER"/"RUN") ahead of the "N/5 · total" reading — matches the
// `@media (max-width: 767px)`-adjacent breakpoints already used for the
// game screen's own layout (#27).
export const RUN_HUD_NARROW_BREAKPOINT_PX = 768;

/**
 * Resolves the header HUD's i18n key + params for a run's current
 * progress ("2/5 · 184" / "SEFER 2/5 · 184") — shared by game-screen.js
 * and result-screen.js so the width threshold and the index/total reading
 * can't drift between the two places the HUD is shown (#30 review).
 * Stays i18n-free like every other export here — callers own the actual
 * `t(key, params)` call. `index` is already 1-based ("region N of 5");
 * `total` is the sum of regions already scored.
 */
export function formatRunHud({ index, total, viewportWidth }) {
  const key = viewportWidth < RUN_HUD_NARROW_BREAKPOINT_PX ? 'run_hud_short' : 'run_hud_long';
  return { key, params: { index, total } };
}

// Fallback search order per rung — if a tier's pool is empty (after
// excluding already-picked regions and the previous run's regions), try
// the nearest tier before giving up on that rung entirely.
const FALLBACK_ORDER = {
  easy: ['easy', 'medium', 'hard'],
  medium: ['medium', 'easy', 'hard'],
  hard: ['hard', 'medium', 'easy'],
};

/**
 * Picks RUN_LENGTH distinct region ids following RUN_DIFFICULTY_LADDER.
 *
 * @param {Array<{id: string, difficulty: string}>} regions - candidate pool
 *   (callers filter to whatever category they want a run to draw from —
 *   e.g. countries only).
 * @param {string[]} excludeIds - regions to avoid if at all possible (the
 *   previous run's regions) — never causes a rung to come up empty if it's
 *   the ONLY reason a tier would be; the no-repeats-within-this-run rule
 *   always wins over it (see the two-pass fallback below).
 * @param {() => number} random - RNG returning [0, 1); injectable so this
 *   is deterministic in tests. Defaults to Math.random.
 * @returns {string[]} up to RUN_LENGTH region ids, in ladder order. Shorter
 *   only if the combined pool (regardless of exclusions) has fewer than
 *   RUN_LENGTH distinct regions.
 */
export function pickRunRegions(regions, excludeIds = [], random = Math.random) {
  const excludeSet = new Set(excludeIds);
  const byDifficulty = { easy: [], medium: [], hard: [] };
  for (const r of regions || []) {
    if (r && byDifficulty[r.difficulty]) byDifficulty[r.difficulty].push(r.id);
  }

  const picked = [];
  const pickedSet = new Set();

  const pickFrom = (pool) => {
    const options = pool.filter((id) => !pickedSet.has(id));
    if (options.length === 0) return null;
    const idx = Math.min(options.length - 1, Math.floor(random() * options.length));
    return options[idx];
  };

  for (const tier of RUN_DIFFICULTY_LADDER) {
    const order = FALLBACK_ORDER[tier];
    // Pass 1: respect excludeIds (skip the previous run's regions).
    let id = null;
    for (const t of order) {
      id = pickFrom(byDifficulty[t].filter((rid) => !excludeSet.has(rid)));
      if (id) break;
    }
    // Pass 2: no-repeats-within-this-run still applies (pickFrom already
    // enforces it via pickedSet), but excludeIds is dropped — better to
    // repeat a region from last run than to end a run short.
    if (!id) {
      for (const t of order) {
        id = pickFrom(byDifficulty[t]);
        if (id) break;
      }
    }
    if (id) {
      picked.push(id);
      pickedSet.add(id);
    }
  }

  return picked;
}
