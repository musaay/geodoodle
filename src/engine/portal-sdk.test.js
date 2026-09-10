import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * DOM-free tests for the CrazyGames SDK wrapper's state machine (#23).
 * `import.meta.env.VITE_PORTAL` is toggled per-test with `vi.stubEnv` (every
 * exported function in portal-sdk.js reads it live via a function call, not
 * a module-load-time constant, specifically so this works) — `unstubAllEnvs`
 * plus `__resetForTest()` in `afterEach` keep tests independent since the
 * module itself holds mutable state (queue, inGameplay, sdkReady/Broken).
 */

async function freshModule() {
  vi.resetModules();
  return import('./portal-sdk.js');
}

describe('portal-sdk wrapper', () => {
  const originalCG = globalThis.window?.CrazyGames;

  beforeEach(() => {
    globalThis.window = globalThis.window || {};
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    if (originalCG) globalThis.window.CrazyGames = originalCG;
    else delete globalThis.window?.CrazyGames;
  });

  it('every export is a no-op outside the portal build, even with a real SDK present', async () => {
    vi.stubEnv('VITE_PORTAL', undefined);
    const calls = [];
    globalThis.window.CrazyGames = {
      SDK: {
        environment: 'crazygames',
        init: () => Promise.resolve(),
        game: {
          loadingStart: () => calls.push('loadingStart'),
          loadingStop: () => calls.push('loadingStop'),
          gameplayStart: () => calls.push('gameplayStart'),
          gameplayStop: () => calls.push('gameplayStop'),
          happytime: () => calls.push('happytime'),
          settings: { muteAudio: false },
          addSettingsChangeListener: () => {},
        },
      },
    };
    const sdk = await freshModule();
    sdk.init();
    sdk.loadingStart();
    sdk.loadingStop();
    sdk.gameplayStart();
    sdk.happytime();
    await Promise.resolve();
    expect(calls).toEqual([]);
    expect(sdk.isInGameplay()).toBe(false);
  });

  it('queues calls made before init() resolves and flushes them in order once it does', async () => {
    vi.stubEnv('VITE_PORTAL', '1');
    const calls = [];
    let resolveInit;
    globalThis.window.CrazyGames = {
      SDK: {
        environment: 'crazygames',
        init: () => new Promise((resolve) => { resolveInit = resolve; }),
        game: {
          loadingStart: () => calls.push('loadingStart'),
          gameplayStart: () => calls.push('gameplayStart'),
          settings: { muteAudio: false },
          addSettingsChangeListener: () => {},
        },
      },
    };
    const sdk = await freshModule();
    sdk.init();
    sdk.loadingStart();
    sdk.gameplayStart();
    expect(calls).toEqual([]); // nothing fires before init() resolves

    resolveInit();
    await Promise.resolve();
    await Promise.resolve();
    expect(calls).toEqual(['loadingStart', 'gameplayStart']);
  });

  it('never calls the SDK when environment resolves to "disabled" (a documented throw-on-call state)', async () => {
    vi.stubEnv('VITE_PORTAL', '1');
    const calls = [];
    globalThis.window.CrazyGames = {
      SDK: {
        environment: 'disabled',
        init: () => Promise.resolve(),
        game: {
          gameplayStart: () => calls.push('gameplayStart'),
          gameplayStop: () => calls.push('gameplayStop'),
          settings: { muteAudio: false },
          addSettingsChangeListener: () => {},
        },
      },
    };
    const sdk = await freshModule();
    sdk.init();
    await Promise.resolve();
    await Promise.resolve();

    sdk.gameplayStart();
    sdk.gameplayStop();
    expect(calls).toEqual([]);
  });

  it('gameplayStop() resets isInGameplay() even when init() fails after a gameplayStart() was already queued', async () => {
    vi.stubEnv('VITE_PORTAL', '1');
    let rejectInit;
    globalThis.window.CrazyGames = {
      SDK: {
        environment: 'crazygames',
        init: () => new Promise((_resolve, reject) => { rejectInit = reject; }),
        game: {
          gameplayStart: () => {},
          gameplayStop: () => {},
          settings: { muteAudio: false },
          addSettingsChangeListener: () => {},
        },
      },
    };
    const sdk = await freshModule();
    sdk.init();
    sdk.gameplayStart(); // queued — init() hasn't resolved or rejected yet
    expect(sdk.isInGameplay()).toBe(true);

    rejectInit(new Error('network failure'));
    await Promise.resolve();
    await Promise.resolve();

    sdk.gameplayStop();
    expect(sdk.isInGameplay()).toBe(false);
  });

  it('is safe (no-op, never throws) when window.CrazyGames is missing entirely', async () => {
    vi.stubEnv('VITE_PORTAL', '1');
    delete globalThis.window.CrazyGames;
    const sdk = await freshModule();
    expect(() => {
      sdk.init();
      sdk.loadingStart();
      sdk.gameplayStart();
      sdk.happytime();
    }).not.toThrow();
    expect(sdk.isInGameplay()).toBe(false);
  });

  it('gameplayStart/gameplayStop are idempotent — no double start, no unmatched stop', async () => {
    vi.stubEnv('VITE_PORTAL', '1');
    const calls = [];
    globalThis.window.CrazyGames = {
      SDK: {
        environment: 'crazygames',
        init: () => Promise.resolve(),
        game: {
          gameplayStart: () => calls.push('start'),
          gameplayStop: () => calls.push('stop'),
          settings: { muteAudio: false },
          addSettingsChangeListener: () => {},
        },
      },
    };
    const sdk = await freshModule();
    sdk.init();
    await Promise.resolve();
    await Promise.resolve();

    sdk.gameplayStart();
    sdk.gameplayStart(); // duplicate — absorbed
    expect(sdk.isInGameplay()).toBe(true);
    expect(calls).toEqual(['start']);

    sdk.gameplayStop();
    sdk.gameplayStop(); // duplicate — absorbed
    expect(sdk.isInGameplay()).toBe(false);
    expect(calls).toEqual(['start', 'stop']);

    sdk.gameplayStart();
    expect(calls).toEqual(['start', 'stop', 'start']);
  });

  it('loadingStop() only reaches the SDK once, even if called from multiple sites', async () => {
    vi.stubEnv('VITE_PORTAL', '1');
    const calls = [];
    globalThis.window.CrazyGames = {
      SDK: {
        environment: 'crazygames',
        init: () => Promise.resolve(),
        game: {
          loadingStop: () => calls.push('loadingStop'),
          settings: { muteAudio: false },
          addSettingsChangeListener: () => {},
        },
      },
    };
    const sdk = await freshModule();
    sdk.init();
    await Promise.resolve();
    await Promise.resolve();

    sdk.loadingStop();
    sdk.loadingStop();
    sdk.loadingStop();
    expect(calls).toEqual(['loadingStop']);
  });

  it('applies the initial muteAudio setting and reacts to addSettingsChangeListener via the audio-engine mute gate', async () => {
    vi.stubEnv('VITE_PORTAL', '1');
    let listener;
    globalThis.window.CrazyGames = {
      SDK: {
        environment: 'crazygames',
        init: () => Promise.resolve(),
        game: {
          settings: { muteAudio: true },
          addSettingsChangeListener: (fn) => { listener = fn; },
        },
      },
    };
    const sdk = await freshModule();
    const audio = await import('./audio-engine.js');
    const spy = vi.spyOn(audio, 'setExternalMute');

    sdk.init();
    await Promise.resolve();
    await Promise.resolve();
    expect(spy).toHaveBeenCalledWith(true);

    listener({ muteAudio: false, disableChat: false });
    expect(spy).toHaveBeenCalledWith(false);
  });
});

/**
 * DOM-free tests for the Yandex Games adapter (#25) — mirrors the CrazyGames
 * suite above (same shared queue/gameplay state machine), stubbing
 * `window.YaGames` and `VITE_PORTAL_TARGET=yandex` instead.
 */
describe('portal-sdk wrapper — Yandex adapter', () => {
  const originalYaGames = globalThis.window?.YaGames;

  beforeEach(() => {
    globalThis.window = globalThis.window || {};
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    if (originalYaGames) globalThis.window.YaGames = originalYaGames;
    else delete globalThis.window?.YaGames;
  });

  it('defaults to the CrazyGames adapter when VITE_PORTAL_TARGET is unset, even with YaGames present', async () => {
    vi.stubEnv('VITE_PORTAL', '1');
    vi.stubEnv('VITE_PORTAL_TARGET', undefined);
    const yaCalls = [];
    globalThis.window.YaGames = {
      init: () => Promise.resolve({
        features: {
          LoadingAPI: { ready: () => yaCalls.push('ready') },
          GameplayAPI: { start: () => yaCalls.push('start'), stop: () => yaCalls.push('stop') },
        },
      }),
    };
    delete globalThis.window.CrazyGames; // CG missing entirely -> broken if the CG branch is (correctly) chosen
    const sdk = await freshModule();
    sdk.init();
    sdk.loadingStop();
    await Promise.resolve();
    await Promise.resolve();
    // The CrazyGames branch was taken (and immediately marked broken, since
    // window.CrazyGames is missing) — the Yandex SDK was never touched.
    expect(yaCalls).toEqual([]);
  });

  it('is a silent no-op when window.YaGames is missing entirely', async () => {
    vi.stubEnv('VITE_PORTAL', '1');
    vi.stubEnv('VITE_PORTAL_TARGET', 'yandex');
    delete globalThis.window.YaGames;
    const sdk = await freshModule();
    expect(() => {
      sdk.init();
      sdk.loadingStart();
      sdk.loadingStop();
      sdk.gameplayStart();
      sdk.gameplayStop();
      sdk.happytime();
    }).not.toThrow();
    expect(sdk.isInGameplay()).toBe(false);
  });

  it('maps loadingStop() to LoadingAPI.ready(), firing only once even from multiple call sites', async () => {
    vi.stubEnv('VITE_PORTAL', '1');
    vi.stubEnv('VITE_PORTAL_TARGET', 'yandex');
    const calls = [];
    globalThis.window.YaGames = {
      init: () => Promise.resolve({
        features: {
          LoadingAPI: { ready: () => calls.push('ready') },
          GameplayAPI: { start: () => {}, stop: () => {} },
        },
      }),
    };
    const sdk = await freshModule();
    sdk.init();
    await Promise.resolve();
    await Promise.resolve();

    sdk.loadingStop();
    sdk.loadingStop();
    sdk.loadingStop();
    expect(calls).toEqual(['ready']);
  });

  it('loadingStart() is a no-op on this target (no such signal in the Yandex SDK)', async () => {
    vi.stubEnv('VITE_PORTAL', '1');
    vi.stubEnv('VITE_PORTAL_TARGET', 'yandex');
    const calls = [];
    globalThis.window.YaGames = {
      init: () => Promise.resolve({
        features: {
          LoadingAPI: { ready: () => calls.push('ready') },
          GameplayAPI: { start: () => {}, stop: () => {} },
        },
      }),
    };
    const sdk = await freshModule();
    sdk.init();
    sdk.loadingStart();
    await Promise.resolve();
    await Promise.resolve();
    expect(calls).toEqual([]);
  });

  it('happytime() is a no-op on this target (no Yandex equivalent)', async () => {
    vi.stubEnv('VITE_PORTAL', '1');
    vi.stubEnv('VITE_PORTAL_TARGET', 'yandex');
    let called = false;
    globalThis.window.YaGames = {
      init: () => Promise.resolve({
        features: {
          LoadingAPI: { ready: () => {} },
          GameplayAPI: { start: () => {}, stop: () => {} },
        },
      }),
    };
    const sdk = await freshModule();
    sdk.init();
    await Promise.resolve();
    await Promise.resolve();
    expect(() => sdk.happytime()).not.toThrow();
    expect(called).toBe(false);
  });

  it('maps gameplayStart/Stop to GameplayAPI.start/stop, idempotently', async () => {
    vi.stubEnv('VITE_PORTAL', '1');
    vi.stubEnv('VITE_PORTAL_TARGET', 'yandex');
    const calls = [];
    globalThis.window.YaGames = {
      init: () => Promise.resolve({
        features: {
          LoadingAPI: { ready: () => {} },
          GameplayAPI: { start: () => calls.push('start'), stop: () => calls.push('stop') },
        },
      }),
    };
    const sdk = await freshModule();
    sdk.init();
    await Promise.resolve();
    await Promise.resolve();

    sdk.gameplayStart();
    sdk.gameplayStart(); // duplicate — absorbed
    expect(sdk.isInGameplay()).toBe(true);
    expect(calls).toEqual(['start']);

    sdk.gameplayStop();
    sdk.gameplayStop(); // duplicate — absorbed
    expect(sdk.isInGameplay()).toBe(false);
    expect(calls).toEqual(['start', 'stop']);
  });

  it('queues calls made before init() resolves and flushes them in order once it does', async () => {
    vi.stubEnv('VITE_PORTAL', '1');
    vi.stubEnv('VITE_PORTAL_TARGET', 'yandex');
    const calls = [];
    let resolveInit;
    globalThis.window.YaGames = {
      init: () => new Promise((resolve) => { resolveInit = resolve; }),
    };
    const sdk = await freshModule();
    sdk.init();
    sdk.gameplayStart();
    expect(calls).toEqual([]); // nothing fires before init() resolves

    resolveInit({
      features: {
        LoadingAPI: { ready: () => {} },
        GameplayAPI: { start: () => calls.push('start'), stop: () => calls.push('stop') },
      },
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(calls).toEqual(['start']);
  });

  it('gameplayStop() resets isInGameplay() even when init() fails after a gameplayStart() was already queued', async () => {
    vi.stubEnv('VITE_PORTAL', '1');
    vi.stubEnv('VITE_PORTAL_TARGET', 'yandex');
    let rejectInit;
    globalThis.window.YaGames = {
      init: () => new Promise((_resolve, reject) => { rejectInit = reject; }),
    };
    const sdk = await freshModule();
    sdk.init();
    sdk.gameplayStart(); // queued — init() hasn't resolved or rejected yet
    expect(sdk.isInGameplay()).toBe(true);

    rejectInit(new Error('network failure'));
    await Promise.resolve();
    await Promise.resolve();

    sdk.gameplayStop();
    expect(sdk.isInGameplay()).toBe(false);
  });
});

/**
 * getPortalLanguage() (#26, requirement 2.14) — DOM-free coverage of the
 * language mapping itself. main.js's "saved preference wins" / "browser
 * fallback when null" behavior is covered in game-state.test.js instead,
 * since it lives in GameState.load(), not here.
 */
describe('portal-sdk wrapper — getPortalLanguage() (#26)', () => {
  beforeEach(() => {
    globalThis.window = globalThis.window || {};
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    delete globalThis.window?.YaGames;
  });

  function stubYaGames(lang) {
    globalThis.window.YaGames = {
      init: () => Promise.resolve({
        environment: { i18n: { lang } },
        features: {
          LoadingAPI: { ready: () => {} },
          GameplayAPI: { start: () => {}, stop: () => {} },
        },
      }),
    };
  }

  it("maps 'tr' to 'tr'", async () => {
    vi.stubEnv('VITE_PORTAL', '1');
    vi.stubEnv('VITE_PORTAL_TARGET', 'yandex');
    stubYaGames('tr');
    const sdk = await freshModule();
    await expect(sdk.getPortalLanguage()).resolves.toBe('tr');
  });

  it.each(['ru', 'de', 'en'])("maps '%s' to 'en'", async (lang) => {
    vi.stubEnv('VITE_PORTAL', '1');
    vi.stubEnv('VITE_PORTAL_TARGET', 'yandex');
    stubYaGames(lang);
    const sdk = await freshModule();
    await expect(sdk.getPortalLanguage()).resolves.toBe('en');
  });

  it('resolves null when window.YaGames is missing entirely', async () => {
    vi.stubEnv('VITE_PORTAL', '1');
    vi.stubEnv('VITE_PORTAL_TARGET', 'yandex');
    delete globalThis.window.YaGames;
    const sdk = await freshModule();
    await expect(sdk.getPortalLanguage()).resolves.toBeNull();
  });

  it('resolves null when init() rejects', async () => {
    vi.stubEnv('VITE_PORTAL', '1');
    vi.stubEnv('VITE_PORTAL_TARGET', 'yandex');
    globalThis.window.YaGames = { init: () => Promise.reject(new Error('network failure')) };
    const sdk = await freshModule();
    await expect(sdk.getPortalLanguage()).resolves.toBeNull();
  });

  it('resolves null when the resolved SDK reports no language', async () => {
    vi.stubEnv('VITE_PORTAL', '1');
    vi.stubEnv('VITE_PORTAL_TARGET', 'yandex');
    globalThis.window.YaGames = {
      init: () => Promise.resolve({
        environment: {},
        features: { LoadingAPI: { ready: () => {} }, GameplayAPI: { start: () => {}, stop: () => {} } },
      }),
    };
    const sdk = await freshModule();
    await expect(sdk.getPortalLanguage()).resolves.toBeNull();
  });

  it('resolves null outside the portal build', async () => {
    vi.stubEnv('VITE_PORTAL', undefined);
    vi.stubEnv('VITE_PORTAL_TARGET', 'yandex');
    stubYaGames('tr');
    const sdk = await freshModule();
    await expect(sdk.getPortalLanguage()).resolves.toBeNull();
  });

  it('resolves null on a non-Yandex target, without touching window.YaGames', async () => {
    vi.stubEnv('VITE_PORTAL', '1');
    vi.stubEnv('VITE_PORTAL_TARGET', undefined);
    let touched = false;
    globalThis.window.YaGames = { init: () => { touched = true; return Promise.resolve({}); } };
    const sdk = await freshModule();
    await expect(sdk.getPortalLanguage()).resolves.toBeNull();
    expect(touched).toBe(false);
  });

  it('never calls YaGames.init() twice when init() already kicked off the same request', async () => {
    vi.stubEnv('VITE_PORTAL', '1');
    vi.stubEnv('VITE_PORTAL_TARGET', 'yandex');
    let initCalls = 0;
    globalThis.window.YaGames = {
      init: () => {
        initCalls += 1;
        return Promise.resolve({
          environment: { i18n: { lang: 'tr' } },
          features: { LoadingAPI: { ready: () => {} }, GameplayAPI: { start: () => {}, stop: () => {} } },
        });
      },
    };
    const sdk = await freshModule();
    sdk.init();
    await expect(sdk.getPortalLanguage()).resolves.toBe('tr');
    expect(initCalls).toBe(1);
  });

  it('logs the raw i18n.lang value once init() settles, for the Yandex debug panel indicator (#26 follow-up)', async () => {
    vi.stubEnv('VITE_PORTAL', '1');
    vi.stubEnv('VITE_PORTAL_TARGET', 'yandex');
    stubYaGames('tr');
    const sdk = await freshModule();
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await sdk.getPortalLanguage();
    expect(spy).toHaveBeenCalledWith('[yandex] i18n.lang', 'tr');
    spy.mockRestore();
  });
});

/**
 * #26 follow-up: Yandex moderation rejected the game because the ORIGINAL
 * getPortalLanguage() raced the i18n READ ITSELF against the first-paint
 * timeout — when init() lost that race, the read never happened at all, so
 * the debug panel's indicator never observed one. These cover the fix: the
 * read (ensureLanguageRead(), reached via onLanguageDetected()) must always
 * complete once init() settles, independent of how getPortalLanguage()'s
 * own timeout resolved.
 */
describe('portal-sdk wrapper — late i18n read after the first-paint timeout (#26 follow-up)', () => {
  beforeEach(() => {
    globalThis.window = globalThis.window || {};
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
    delete globalThis.window?.YaGames;
  });

  it('init settling after the timeout still reads the language, delivered via onLanguageDetected()', async () => {
    vi.stubEnv('VITE_PORTAL', '1');
    vi.stubEnv('VITE_PORTAL_TARGET', 'yandex');
    vi.useFakeTimers();
    let resolveInit;
    globalThis.window.YaGames = {
      init: () => new Promise((resolve) => { resolveInit = resolve; }),
    };
    const sdk = await freshModule();

    const firstPaintLanguage = sdk.getPortalLanguage();
    await vi.advanceTimersByTimeAsync(3000); // the 3s first-paint timeout wins the race
    await expect(firstPaintLanguage).resolves.toBeNull();

    let detected = 'not called';
    sdk.onLanguageDetected((lang) => { detected = lang; });

    // init() FINALLY settles, well after the timeout — the read must still happen.
    resolveInit({
      environment: { i18n: { lang: 'tr' } },
      features: { LoadingAPI: { ready: () => {} }, GameplayAPI: { start: () => {}, stop: () => {} } },
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(detected).toBe('tr');
  });

  it('onLanguageDetected() still delivers the language after getPortalLanguage() already consumed it — the read is unconditional, not gated on any saved-preference decision', async () => {
    vi.stubEnv('VITE_PORTAL', '1');
    vi.stubEnv('VITE_PORTAL_TARGET', 'yandex');
    globalThis.window.YaGames = {
      init: () => Promise.resolve({
        environment: { i18n: { lang: 'tr' } },
        features: { LoadingAPI: { ready: () => {} }, GameplayAPI: { start: () => {}, stop: () => {} } },
      }),
    };
    const sdk = await freshModule();
    await expect(sdk.getPortalLanguage()).resolves.toBe('tr');

    let detected;
    sdk.onLanguageDetected((lang) => { detected = lang; });
    await Promise.resolve();
    await Promise.resolve();
    expect(detected).toBe('tr');
  });

  it('onLanguageDetected() delivers null (not silence) when the read completes but reports no usable language', async () => {
    vi.stubEnv('VITE_PORTAL', '1');
    vi.stubEnv('VITE_PORTAL_TARGET', 'yandex');
    globalThis.window.YaGames = {
      init: () => Promise.resolve({
        environment: {},
        features: { LoadingAPI: { ready: () => {} }, GameplayAPI: { start: () => {}, stop: () => {} } },
      }),
    };
    const sdk = await freshModule();
    let detected = 'not called';
    sdk.onLanguageDetected((lang) => { detected = lang; });
    // Flush every microtask in the init()->ensureLanguageRead()->callback
    // chain (a plain macrotask tick, rather than counting .then() hops).
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(detected).toBeNull();
  });

  it('onLanguageDetected() is a no-op outside the portal build / non-yandex target, without touching window.YaGames', async () => {
    vi.stubEnv('VITE_PORTAL', undefined);
    vi.stubEnv('VITE_PORTAL_TARGET', 'yandex');
    let touched = false;
    globalThis.window.YaGames = { init: () => { touched = true; return Promise.resolve({}); } };
    const sdk = await freshModule();
    let called = false;
    expect(() => sdk.onLanguageDetected(() => { called = true; })).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();
    expect(called).toBe(false);
    expect(touched).toBe(false);
  });
});
