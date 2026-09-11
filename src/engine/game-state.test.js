import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { isSoundEnabled as audioEngineSoundEnabled } from './audio-engine.js';
import { getDailyRegionPool, getDailyRegionIds } from './daily.js';

// Minimal in-memory localStorage stub — GameState persists via the global,
// and this test environment has no DOM/localStorage of its own.
function makeLocalStorageStub() {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  };
}

globalThis.localStorage = makeLocalStorageStub();

const { GameState, detectBrowserLanguage } = await import('./game-state.js');

describe('GameState onboarding flag', () => {
  beforeEach(() => {
    globalThis.localStorage.clear();
  });

  it('defaults to unseen and persists once set', () => {
    const state = new GameState();
    expect(state.hasSeenOnboarding()).toBe(false);

    state.setOnboardingSeen();
    expect(state.hasSeenOnboarding()).toBe(true);

    // Reload from storage to confirm it actually persisted, not just in-memory
    const reloaded = new GameState();
    expect(reloaded.hasSeenOnboarding()).toBe(true);
  });

  it('is cleared by resetAll, so onboarding shows again', () => {
    const state = new GameState();
    state.setOnboardingSeen();
    expect(state.hasSeenOnboarding()).toBe(true);

    state.resetAll();
    expect(state.hasSeenOnboarding()).toBe(false);
  });
});

describe('GameState best chain (#15)', () => {
  beforeEach(() => {
    globalThis.localStorage.clear();
  });

  it('defaults to no best chain', () => {
    const state = new GameState();
    expect(state.getBestChain()).toBeNull();
  });

  it('records the first result as the best and persists it', () => {
    const state = new GameState();
    const isNewBest = state.recordChainResult(3, 250);
    expect(isNewBest).toBe(true);
    expect(state.getBestChain()).toMatchObject({ links: 3, total: 250 });

    const reloaded = new GameState();
    expect(reloaded.getBestChain()).toMatchObject({ links: 3, total: 250 });
  });

  it('only replaces the best when the new total is higher', () => {
    const state = new GameState();
    state.recordChainResult(3, 250);

    expect(state.recordChainResult(2, 100)).toBe(false);
    expect(state.getBestChain()).toMatchObject({ links: 3, total: 250 });

    expect(state.recordChainResult(5, 400)).toBe(true);
    expect(state.getBestChain()).toMatchObject({ links: 5, total: 400 });
  });

  it('is cleared by resetAll', () => {
    const state = new GameState();
    state.recordChainResult(3, 250);
    state.resetAll();
    expect(state.getBestChain()).toBeNull();
  });
});

describe('GameState chain mode (#15)', () => {
  beforeEach(() => {
    globalThis.localStorage.clear();
  });

  it('defaults to trace', () => {
    const state = new GameState();
    expect(state.getChainMode()).toBe('trace');
  });

  it('persists a chosen mode across reloads', () => {
    const state = new GameState();
    state.setChainMode('blind');
    expect(state.getChainMode()).toBe('blind');

    const reloaded = new GameState();
    expect(reloaded.getChainMode()).toBe('blind');
  });

  it('ignores an invalid mode', () => {
    const state = new GameState();
    state.setChainMode('not-a-mode');
    expect(state.getChainMode()).toBe('trace');
  });

  it('is reset to trace by resetAll', () => {
    const state = new GameState();
    state.setChainMode('blind');
    state.resetAll();
    expect(state.getChainMode()).toBe('trace');
  });
});

describe('GameState brush size (#24)', () => {
  beforeEach(() => {
    globalThis.localStorage.clear();
  });

  it('defaults to medium', () => {
    const state = new GameState();
    expect(state.getBrushSize()).toBe('medium');
  });

  it('persists a chosen size across reloads', () => {
    const state = new GameState();
    state.setBrushSize('thin');
    expect(state.getBrushSize()).toBe('thin');

    const reloaded = new GameState();
    expect(reloaded.getBrushSize()).toBe('thin');
  });

  it('ignores an invalid size', () => {
    const state = new GameState();
    state.setBrushSize('thick');
    state.setBrushSize('not-a-size');
    expect(state.getBrushSize()).toBe('thick');
  });

  it('loads an old saved state without the key as medium', () => {
    globalThis.localStorage.setItem('geodoodle_state', JSON.stringify({ theme: 'night' }));
    const state = new GameState();
    expect(state.getBrushSize()).toBe('medium');
  });

  it('is reset to medium by resetAll', () => {
    const state = new GameState();
    state.setBrushSize('thick');
    state.resetAll();
    expect(state.getBrushSize()).toBe('medium');
  });
});

describe('GameState Daily Triple (#17)', () => {
  beforeEach(() => {
    globalThis.localStorage.clear();
  });

  function dateStrOffset(days) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  it('has no entry for a day nothing was played', () => {
    const state = new GameState();
    expect(state.getDailyEntry(dateStrOffset(0))).toBeNull();
  });

  it('accumulates best-of-day scores per region and a running total', () => {
    const state = new GameState();
    state.recordDailyResult('turkey', 60);
    state.recordDailyResult('italy', 80);

    const today = dateStrOffset(0);
    expect(state.getDailyEntry(today)).toEqual({
      scores: { turkey: 60, italy: 80 },
      total: 140,
    });
  });

  it('keeps the higher score on a repeat attempt at the same region', () => {
    const state = new GameState();
    state.recordDailyResult('turkey', 60);
    state.recordDailyResult('turkey', 45); // worse — ignored
    state.recordDailyResult('turkey', 90); // better — kept

    expect(state.getDailyEntry(dateStrOffset(0))).toEqual({
      scores: { turkey: 90 },
      total: 90,
    });
  });

  it('migrates a pre-#17 single-region entry when adding a second region', () => {
    const today = dateStrOffset(0);
    globalThis.localStorage.setItem('geodoodle_state', JSON.stringify({
      daily: { [today]: { regionId: 'turkey', score: 72 } },
    }));

    const state = new GameState();
    expect(state.getDailyEntry(today)).toEqual({ scores: { turkey: 72 }, total: 72 });

    state.recordDailyResult('italy', 50);
    expect(state.getDailyEntry(today)).toEqual({
      scores: { turkey: 72, italy: 50 },
      total: 122,
    });
  });

  describe('getDailyStreak', () => {
    it('grandfathers a pre-#17 single-region day as played', () => {
      const yesterday = dateStrOffset(-1);
      globalThis.localStorage.setItem('geodoodle_state', JSON.stringify({
        daily: { [yesterday]: { regionId: 'turkey', score: 72 } },
      }));

      const state = new GameState();
      state.recordDailyResult('turkey', 80); // completes today with 1 region — see below
      // Today only has 1 of 3 regions played, so today itself doesn't count,
      // but the streak should still reach back through yesterday's old-shape day.
      expect(state.getDailyStreak()).toBeGreaterThanOrEqual(1);
    });

    it('requires all 3 regions for a post-#17 day to count', () => {
      const state = new GameState();
      const today = dateStrOffset(0);
      const pool = getDailyRegionPool();
      const regionIds = getDailyRegionIds(today, pool, 3);

      state.recordDailyResult(regionIds[0], 80);
      state.recordDailyResult(regionIds[1], 70);
      // Only 2 of 3 played — shouldn't count as a played day yet.
      expect(state.getDailyStreak()).toBe(0);

      state.recordDailyResult(regionIds[2], 60);
      // All 3 played — now it counts.
      expect(state.getDailyStreak()).toBe(1);
    });
  });
});

describe('GameState sound preference', () => {
  beforeEach(() => {
    globalThis.localStorage.clear();
  });

  it('defaults to enabled on first run', () => {
    const state = new GameState();
    expect(state.isSoundEnabled()).toBe(true);
    expect(audioEngineSoundEnabled()).toBe(true);
  });

  it('setSoundEnabled(false) persists and syncs the audio engine', () => {
    const state = new GameState();
    state.setSoundEnabled(false);
    expect(state.isSoundEnabled()).toBe(false);
    expect(audioEngineSoundEnabled()).toBe(false);

    // Reload from storage to confirm it actually persisted, not just in-memory
    const reloaded = new GameState();
    expect(reloaded.isSoundEnabled()).toBe(false);
    expect(audioEngineSoundEnabled()).toBe(false);
  });

  it('migrates an old saved blob without soundEnabled to the enabled default', () => {
    // Simulate a returning player whose save predates this preference.
    globalThis.localStorage.setItem('geodoodle_state', JSON.stringify({ theme: 'night', language: 'en' }));
    const state = new GameState();
    expect(state.isSoundEnabled()).toBe(true);
  });

  it('resetAll restores the enabled default', () => {
    const state = new GameState();
    state.setSoundEnabled(false);
    expect(state.isSoundEnabled()).toBe(false);

    state.resetAll();
    expect(state.isSoundEnabled()).toBe(true);
    expect(audioEngineSoundEnabled()).toBe(true);
  });
});

describe('detectBrowserLanguage', () => {
  const hadNavigator = 'navigator' in globalThis;
  const originalNavigator = globalThis.navigator;

  afterEach(() => {
    if (hadNavigator) globalThis.navigator = originalNavigator;
    else delete globalThis.navigator;
  });

  it('falls back to tr when there is no navigator at all (this test env)', () => {
    delete globalThis.navigator;
    expect(detectBrowserLanguage()).toBe('tr');
  });

  it('picks tr when a tr* locale is present', () => {
    globalThis.navigator = { languages: ['tr-TR', 'en-US'], language: 'tr-TR' };
    expect(detectBrowserLanguage()).toBe('tr');
  });

  it('picks en for a non-Turkish browser locale', () => {
    globalThis.navigator = { languages: ['en-US', 'fr-FR'], language: 'en-US' };
    expect(detectBrowserLanguage()).toBe('en');
  });
});

describe('GameState first-run language', () => {
  const hadNavigator = 'navigator' in globalThis;
  const originalNavigator = globalThis.navigator;

  beforeEach(() => {
    globalThis.localStorage.clear();
  });

  afterEach(() => {
    if (hadNavigator) globalThis.navigator = originalNavigator;
    else delete globalThis.navigator;
  });

  it('uses the detected browser language on a true first run', () => {
    globalThis.navigator = { languages: ['fr-FR'], language: 'fr-FR' };
    const state = new GameState();
    expect(state.getLanguage()).toBe('en');
  });

  it('leaves an existing saved language preference untouched, even if it disagrees with the browser', () => {
    // Seed storage with an existing 'tr' preference, as a returning player would have.
    const seed = new GameState();
    seed.state.language = 'tr';
    seed.save();

    // Browser now reports English — should have no effect on the saved preference.
    globalThis.navigator = { languages: ['en-US'], language: 'en-US' };
    const state = new GameState();
    expect(state.getLanguage()).toBe('tr');
  });

  // #26: portalLanguage is main.js's Yandex-SDK-detected language (from
  // portal-sdk.js's getPortalLanguage()) — it must win over browser
  // detection on a true first run, but never override a saved preference.
  it('portalLanguage wins over browser detection on a true first run', () => {
    globalThis.navigator = { languages: ['en-US'], language: 'en-US' };
    const state = new GameState('tr');
    expect(state.getLanguage()).toBe('tr');
  });

  it('an existing saved preference wins over portalLanguage', () => {
    const seed = new GameState();
    seed.state.language = 'en';
    seed.save();

    const state = new GameState('tr');
    expect(state.getLanguage()).toBe('en');
  });

  it('falls back to browser detection when portalLanguage is null (non-Yandex targets)', () => {
    globalThis.navigator = { languages: ['tr-TR'], language: 'tr-TR' };
    const state = new GameState(null);
    expect(state.getLanguage()).toBe('tr');
  });

  // #26 follow-up: main.js uses hadSavedState to decide whether a late
  // Yandex SDK language read (arriving after first paint) is eligible to
  // be applied — only ever true on a genuine first run.
  it('hadSavedState is false on a true first run and true once a preference has been saved', () => {
    const first = new GameState();
    expect(first.hadSavedState).toBe(false);

    first.save();
    const returning = new GameState();
    expect(returning.hadSavedState).toBe(true);
  });

  // code-reviewer follow-up: a throwing localStorage (private-mode quota,
  // corrupted store) is caught by load()'s existing try/catch and must be
  // treated as a first run, same as no saved key at all — never left
  // reporting hadSavedState === true for storage that was never read.
  it('hadSavedState is false when localStorage.getItem throws', () => {
    const originalGetItem = globalThis.localStorage.getItem;
    globalThis.localStorage.getItem = () => { throw new Error('storage unavailable'); };
    try {
      const state = new GameState();
      expect(state.hadSavedState).toBe(false);
    } finally {
      globalThis.localStorage.getItem = originalGetItem;
    }
  });
});

describe('GameState.setLanguage (#26 follow-up)', () => {
  beforeEach(() => {
    globalThis.localStorage.clear();
  });

  it('applies a valid language and persists it', () => {
    const state = new GameState();
    state.setLanguage('tr');
    expect(state.getLanguage()).toBe('tr');

    const reloaded = new GameState();
    expect(reloaded.getLanguage()).toBe('tr');
  });

  it('is a no-op for an invalid value', () => {
    const state = new GameState();
    state.state.language = 'en';
    state.setLanguage('fr');
    expect(state.getLanguage()).toBe('en');
  });

  it('is a no-op when the value already matches (no redundant save/notify)', () => {
    const state = new GameState();
    state.state.language = 'en';
    let notified = false;
    state.onChange(() => { notified = true; });
    state.setLanguage('en');
    expect(notified).toBe(false);
  });
});

describe('GameState.canApplyLatePortalLanguage (#26 follow-up)', () => {
  beforeEach(() => {
    globalThis.localStorage.clear();
  });

  it('is eligible on a true first run, with a real, different language, no manual change and no round started', () => {
    const state = new GameState(); // true first run -> hadSavedState === false
    state.state.language = 'en';
    expect(state.canApplyLatePortalLanguage('tr')).toBe(true);
  });

  it('is not eligible once a round has started, even on a true first run', () => {
    const state = new GameState();
    state.state.language = 'en';
    expect(state.canApplyLatePortalLanguage('tr', { inGameplay: true })).toBe(false);
  });

  it('is not eligible once the player already changed language by hand', () => {
    const state = new GameState();
    state.state.language = 'en';
    expect(state.canApplyLatePortalLanguage('tr', { manualChange: true })).toBe(false);
  });

  it('never overrides a returning player\'s saved preference', () => {
    // Seed storage directly (as the other saved-preference tests above do)
    // rather than via setLanguage(), which is a guarded no-op when the
    // target already matches whatever this test env's ambient navigator
    // language happens to detect.
    const seed = new GameState();
    seed.state.language = 'en';
    seed.save();
    const returning = new GameState(); // loads the saved 'en' -> hadSavedState === true
    expect(returning.canApplyLatePortalLanguage('tr')).toBe(false);
  });

  it('is not eligible for a falsy/unreported language', () => {
    const state = new GameState();
    expect(state.canApplyLatePortalLanguage(null)).toBe(false);
  });

  it('is not eligible when the detected language already matches the current one', () => {
    const state = new GameState();
    state.state.language = 'tr';
    expect(state.canApplyLatePortalLanguage('tr')).toBe(false);
  });
});

describe('GameState Sefer / Run mode (#30)', () => {
  beforeEach(() => {
    globalThis.localStorage.clear();
  });

  const REGION_IDS = ['r1', 'r2', 'r3', 'r4', 'r5'];

  it('defaults to no active run, no best run, and no excluded regions', () => {
    const state = new GameState();
    expect(state.getActiveRun()).toBeNull();
    expect(state.getBestRun()).toBeNull();
    expect(state.getLastRunRegionIds()).toEqual([]);
  });

  it('starting a run persists its regions, mode, and a fresh progress state', () => {
    const state = new GameState();
    state.startRun('trace', REGION_IDS);

    const run = state.getActiveRun();
    expect(run).toMatchObject({ mode: 'trace', index: 0, scores: [] });
    expect(run.regionIds).toEqual(REGION_IDS);
    expect(typeof run.startedAt).toBe('number');

    // Reload from storage to confirm it actually persisted, not just in-memory.
    const reloaded = new GameState();
    expect(reloaded.getActiveRun()).toMatchObject({ mode: 'trace', index: 0, regionIds: REGION_IDS });
  });

  it('starting a run does not mutate the regionIds array passed in', () => {
    const state = new GameState();
    const ids = [...REGION_IDS];
    state.startRun('trace', ids);
    state.recordRunRegionScore(80);
    expect(ids).toEqual(REGION_IDS); // startRun copied it, didn't alias it
  });

  it('recordRunRegionScore advances the index and accumulates the total', () => {
    const state = new GameState();
    state.startRun('trace', REGION_IDS);

    const r1 = state.recordRunRegionScore(80);
    expect(r1).toEqual({ index: 1, total: 80, isComplete: false });

    const r2 = state.recordRunRegionScore(60);
    expect(r2).toEqual({ index: 2, total: 140, isComplete: false });

    expect(state.getActiveRun().scores).toEqual([80, 60]);
  });

  it('recordRunRegionScore is a no-op when there is no active run', () => {
    const state = new GameState();
    expect(state.recordRunRegionScore(90)).toBeNull();
    expect(state.getActiveRun()).toBeNull();
  });

  it('getActiveRun self-heals a stale out-of-range index instead of handing back an unresolvable run', () => {
    const state = new GameState();
    // Simulate the narrow window recordRunRegionScore()'s own doc comment
    // describes: index already incremented past the last region (and
    // persisted) but completeRun() never followed up — a real path (tab/
    // process killed between the two calls) this guard exists for.
    state.state.activeRun = { regionIds: REGION_IDS, mode: 'trace', index: 5, scores: [80, 60, 70, 50, 90], startedAt: Date.now() };
    state.save();

    expect(state.getActiveRun()).toBeNull();
    // The self-heal itself must persist — a stale reload must not resurrect it.
    const reloaded = new GameState();
    expect(reloaded.getActiveRun()).toBeNull();
  });

  it('is marked complete once every region has a score, and the final progress persists across a reload', () => {
    const state = new GameState();
    state.startRun('blind', REGION_IDS);
    let lastResult;
    for (const score of [80, 60, 70, 50, 90]) {
      lastResult = state.recordRunRegionScore(score);
    }
    expect(lastResult).toEqual({ index: 5, total: 350, isComplete: true });

    // getActiveRun() self-heals an index === regionIds.length run — it's
    // done, not "active" (see the self-heal test above) — so the raw
    // persisted field is what's checked here, independent of that.
    const reloaded = new GameState();
    expect(reloaded.state.activeRun).toMatchObject({ index: 5, scores: [80, 60, 70, 50, 90] });
  });

  it('reports isComplete true exactly on the region that fills the run', () => {
    const state = new GameState();
    state.startRun('trace', REGION_IDS);
    for (let i = 0; i < 4; i++) {
      expect(state.recordRunRegionScore(50).isComplete).toBe(false);
    }
    expect(state.recordRunRegionScore(50).isComplete).toBe(true);
  });

  it('completeRun finalizes the run: clears activeRun, archives its regions, records a new best', () => {
    const state = new GameState();
    state.startRun('trace', REGION_IDS);
    [80, 60, 70, 50, 90].forEach((s) => state.recordRunRegionScore(s));

    const summary = state.completeRun();
    expect(summary).toMatchObject({
      regionIds: REGION_IDS,
      scores: [80, 60, 70, 50, 90],
      mode: 'trace',
      total: 350,
      isNewBest: true,
    });
    expect(typeof summary.durationS).toBe('number');

    expect(state.getActiveRun()).toBeNull();
    expect(state.getBestRun()).toMatchObject({ total: 350 });
    expect(state.getLastRunRegionIds()).toEqual(REGION_IDS);
  });

  it('completeRun only replaces the best when the new total is higher', () => {
    const state = new GameState();
    state.startRun('trace', REGION_IDS);
    [90, 90, 90, 90, 90].forEach((s) => state.recordRunRegionScore(s));
    expect(state.completeRun().isNewBest).toBe(true);
    expect(state.getBestRun().total).toBe(450);

    state.startRun('trace', REGION_IDS);
    [10, 10, 10, 10, 10].forEach((s) => state.recordRunRegionScore(s));
    const worse = state.completeRun();
    expect(worse.isNewBest).toBe(false);
    expect(state.getBestRun().total).toBe(450); // unchanged
  });

  it('completeRun is a no-op when there is no active run', () => {
    const state = new GameState();
    expect(state.completeRun()).toBeNull();
  });

  it('clearActiveRun drops an in-progress run without recording a best or archiving its regions', () => {
    const state = new GameState();
    state.startRun('trace', REGION_IDS);
    state.recordRunRegionScore(80);

    state.clearActiveRun();
    expect(state.getActiveRun()).toBeNull();
    expect(state.getBestRun()).toBeNull();
    expect(state.getLastRunRegionIds()).toEqual([]);
  });

  it('clearActiveRun is a harmless no-op when there is no active run', () => {
    const state = new GameState();
    expect(() => state.clearActiveRun()).not.toThrow();
    expect(state.getActiveRun()).toBeNull();
  });

  it('is cleared by resetAll', () => {
    const state = new GameState();
    state.startRun('trace', REGION_IDS);
    [80, 60, 70, 50, 90].forEach((s) => state.recordRunRegionScore(s));
    state.completeRun();
    state.startRun('trace', REGION_IDS);

    state.resetAll();
    expect(state.getActiveRun()).toBeNull();
    expect(state.getBestRun()).toBeNull();
    expect(state.getLastRunRegionIds()).toEqual([]);
  });
});
