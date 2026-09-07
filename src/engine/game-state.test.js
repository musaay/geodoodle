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
});
