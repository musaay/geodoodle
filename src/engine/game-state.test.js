import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { isSoundEnabled as audioEngineSoundEnabled } from './audio-engine.js';

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
