import { setExternalMute } from './audio-engine.js';

/**
 * Platform-agnostic portal SDK facade. Exposes one small API (init,
 * loadingStart/Stop, gameplayStart/Stop, isInGameplay, happytime) shared by
 * two adapters — CrazyGames (#23) and Yandex Games (#25) — behind a single
 * queue-before-init / idempotent-gameplay state machine. The target adapter
 * is picked via `isYandexTarget()` below, itself reading
 * `import.meta.env.VITE_PORTAL_TARGET` — a build-time constant Vite inlines
 * the same way it inlines VITE_PORTAL (see `isPortalBuild()`), so
 * Rollup/esbuild's minifier can fold the per-call `if (isYandexTarget())`
 * branches to a constant and dead-code-eliminate the adapter not built for
 * a given target.
 *
 * === CrazyGames SDK v3 — DISCOVERY NOTES, fetched from
 * docs.crazygames.com on 2026-09-08 (#23; the docs site's paths had moved
 * since an earlier pass, so these are re-verified against the current site):
 *
 * Script tag (crazygames target only — injected by vite.config.js's
 * transformIndexHtml, keyed on VITE_PORTAL + VITE_PORTAL_TARGET, never
 * present in the web build or the yandex target):
 *   <script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"></script>
 *
 * Init — async, and the SDK is documented as "unusable until initialized":
 *   await window.CrazyGames.SDK.init();
 *
 * window.CrazyGames.SDK.environment — set once init() resolves, one of:
 *   'crazygames' — running on a CrazyGames domain; full functionality.
 *   'local'      — localhost/127.0.0.1 (or any domain with ?useLocalSdk=true
 *                  appended): ads render as overlay text instead of real
 *                  ads, SDK console logging is turned on automatically, and
 *                  user/leaderboard data is demo data. This is also how the
 *                  CG QA tool's "local" mode is triggered for smoke testing.
 *   'disabled'   — any other domain (e.g. our own site, or a bare preview
 *                  URL that isn't recognized as CrazyGames/local). The docs
 *                  are explicit that "all SDK method calls will throw" in
 *                  this state — every call in this wrapper is gated on
 *                  environment !== 'disabled' for exactly that reason.
 *
 * Game module (window.CrazyGames.SDK.game):
 *   loadingStart() / loadingStop() — bracket the initial load: "whenever you
 *     start loading your game" / "when the loading is complete".
 *   gameplayStart() / gameplayStop() — bracket actual play: start when "the
 *     player starts playing or resumes playing after a break" (game start,
 *     resume, revive, next level); stop on "every game break" (menu, level
 *     end, pause).
 *   happytime() — "use this feature sparingly", on player achievements
 *     (beating a boss, reaching a highscore, etc.).
 *   settings — `{ muteAudio: boolean, disableChat: boolean }`. Read the
 *     current value via `SDK.game.settings`; `addSettingsChangeListener(fn)`
 *     registers `fn(newSettings)`, called with the full updated settings
 *     object each time settings change. The docs say muteAudio "should take
 *     priority over your in-game audio settings".
 *
 * Local testing: `?useLocalSdk=true` forces 'local' environment on a
 * non-localhost domain; `?muteAudio=true` / `?disableChat=true` force those
 * settings for testing without a real CrazyGames session. `local` also
 * turns on SDK console logging automatically, which is what the smoke test
 * below reads to confirm event ordering.
 *
 * === Yandex Games SDK — DISCOVERY NOTES, fetched from
 * yandex.com/dev/games/doc/en/sdk/{sdk-about,sdk-game-events} on 2026-09-10:
 *
 * Script tag (yandex target only — injected by vite.config.js; a RELATIVE
 * path, since the built package.zip is uploaded to Yandex's own server,
 * which serves the SDK from that path on its own domain):
 *   <script src="/sdk.js"></script>
 * The docs are explicit that this script must finish loading before
 * YaGames.init() is called, or it throws a ReferenceError — vite.config.js
 * injects it as a plain synchronous <head> tag (ahead of our own bundle) so
 * load order is guaranteed without needing async/onload handling here.
 *
 * Init — async, and (unlike CrazyGames's window.CrazyGames.SDK namespace)
 * resolves to the SDK instance itself, which must be kept around:
 *   const ysdk = await YaGames.init();
 * No documented "environment" concept (no crazygames/local/disabled
 * equivalent) — once init() resolves, ysdk is assumed fully usable. The only
 * broken states this wrapper handles are init() rejecting, or
 * window.YaGames missing entirely (ad-blocker, network failure, or simply
 * not running on Yandex Games).
 *
 * ysdk.features.LoadingAPI.ready() — call "when the game has loaded all
 * resources and is ready to interact with the user". Mapped to this
 * wrapper's loadingStop(); Yandex has no separate "loading start" signal, so
 * loadingStart() is a no-op on this target.
 *
 * ysdk.features.GameplayAPI.start() / .stop() — "the gameplay is
 * immediately started/stopped" — call start() on level start/menu
 * close/unpause/resume-after-ad/tab-refocus, stop() on level end/menu
 * open/pause/ad-shown/tab-blur. Same shape as CrazyGames's
 * gameplayStart/Stop, mapped 1:1 onto this wrapper's existing calls.
 *
 * No ad calls in this issue (#25) — LoadingAPI/GameplayAPI only.
 *
 * happytime(): no Yandex equivalent found in either doc page — no-op.
 *
 * Settings/mute: no documented mute-forwarding API in either doc page — the
 * external-mute sync below (applySettings/addSettingsChangeListener) is
 * CrazyGames-only; the Yandex adapter never calls setExternalMute().
 *
 * Design decisions beyond what's documented (there's no documented queueing
 * or dead-code-elimination behavior — both are choices made here, shared by
 * both adapters):
 *   - `init()` runs in the background and never throws or blocks first
 *     paint. Every other export called before it resolves is QUEUED (not
 *     dropped) and flushed in call order once init() settles successfully —
 *     `loadingStart()` is called as early as possible in main.js specifically
 *     so it's always the first thing in that queue.
 *   - If init() rejects, the platform's global SDK object is missing
 *     entirely (ad-blocker, network failure, or simply not running on that
 *     platform), or (CrazyGames only) `SDK.environment === 'disabled'` once
 *     init DOES resolve, every export becomes a permanent no-op and the
 *     queue is dropped rather than flushed — flushing into a broken/disabled
 *     SDK is exactly what throws.
 *   - Every export is ALSO a no-op unless `import.meta.env.VITE_PORTAL ===
 *     '1'` — checked first, in every export, so Vite's static replacement
 *     of that env var lets Rollup/Terser fold the branch away in the web
 *     build (`import.meta.env.VITE_PORTAL` is `undefined` there).
 *   - `gameplayStart`/`gameplayStop` track a single `inGameplay` boolean so
 *     they're idempotent regardless of how many call sites fire them (game
 *     screen lifecycle, tab-visibility handling in main.js) — a duplicate
 *     start or an unmatched stop is silently absorbed rather than sending a
 *     mismatched pair to the SDK.
 */

function isPortalBuild() {
  return import.meta.env.VITE_PORTAL === '1';
}

function isYandexTarget() {
  return import.meta.env.VITE_PORTAL_TARGET === 'yandex';
}

let sdkReady = false; // init() resolved AND (CrazyGames only) environment is usable
let sdkBroken = false; // init() failed, SDK missing, or environment disabled — never usable
let queue = [];
let inGameplay = false;
let loadingStopped = false;
let ysdk = null; // the resolved Yandex SDK instance (yandex target only)

function flushQueue() {
  const pending = queue;
  queue = [];
  for (const fn of pending) {
    try { fn(); } catch (e) { /* one bad queued call must not break the rest */ }
  }
}

function callOrQueue(fn) {
  if (sdkBroken) return;
  if (sdkReady) {
    try { fn(); } catch (e) { /* SDK call failures are never fatal to the game */ }
    return;
  }
  queue.push(fn);
}

function markBroken() {
  sdkBroken = true;
  queue = [];
}

function applySettings(settings) {
  setExternalMute(!!settings?.muteAudio);
}

/**
 * Starts SDK init in the background. Safe to call multiple times (a no-op
 * after the first real attempt) and safe to call outside the portal build
 * (a no-op there too). Never throws.
 */
export function init() {
  if (!isPortalBuild()) return;
  if (sdkReady || sdkBroken) return;

  if (isYandexTarget()) {
    const YaGames = typeof window !== 'undefined' ? window.YaGames : undefined;
    if (!YaGames?.init) {
      markBroken();
      return;
    }
    Promise.resolve(YaGames.init())
      .then((resolvedSdk) => {
        ysdk = resolvedSdk;
        sdkReady = true;
        flushQueue();
      })
      .catch(() => {
        markBroken();
      });
    return;
  }

  const CG = typeof window !== 'undefined' ? window.CrazyGames : undefined;
  if (!CG?.SDK?.init) {
    markBroken();
    return;
  }

  Promise.resolve(CG.SDK.init())
    .then(() => {
      if (CG.SDK.environment === 'disabled') {
        markBroken();
        return;
      }
      sdkReady = true;
      flushQueue();
      try {
        applySettings(CG.SDK.game.settings);
        CG.SDK.game.addSettingsChangeListener(applySettings);
      } catch (e) {
        // Settings sync is a nice-to-have — never let it break init.
      }
    })
    .catch(() => {
      markBroken();
    });
}

/** Call as early as possible (main.js, before geometry/data fetches). */
export function loadingStart() {
  if (!isPortalBuild()) return;
  if (isYandexTarget()) return; // no "loading start" signal on this target — only ready()
  callOrQueue(() => window.CrazyGames.SDK.game.loadingStart());
}

/** Idempotent — the first screen to become interactive (home or instant-play game) wins; later callers are no-ops. */
export function loadingStop() {
  if (!isPortalBuild() || loadingStopped) return;
  loadingStopped = true;
  if (isYandexTarget()) {
    callOrQueue(() => ysdk.features.LoadingAPI.ready());
    return;
  }
  callOrQueue(() => window.CrazyGames.SDK.game.loadingStop());
}

export function gameplayStart() {
  // sdkBroken is checked here too (not just inside callOrQueue) so
  // isInGameplay() never reports true for a round the SDK will never
  // actually hear about — e.g. the platform's global SDK object missing entirely.
  if (!isPortalBuild() || sdkBroken || inGameplay) return;
  inGameplay = true;
  if (isYandexTarget()) {
    callOrQueue(() => ysdk.features.GameplayAPI.start());
    return;
  }
  callOrQueue(() => window.CrazyGames.SDK.game.gameplayStart());
}

export function gameplayStop() {
  if (!isPortalBuild() || !inGameplay) return;
  // `inGameplay` is reset unconditionally, BEFORE the sdkBroken check —
  // gameplayStart() can have already flipped it true while init() was still
  // pending (queued, not yet known broken); if init() later fails or
  // resolves disabled, sdkBroken becomes true with `inGameplay` still true,
  // and checking sdkBroken first here would leave isInGameplay() stuck
  // reporting an unmatched start forever (code-reviewer finding, #23).
  inGameplay = false;
  if (sdkBroken) return;
  if (isYandexTarget()) {
    callOrQueue(() => ysdk.features.GameplayAPI.stop());
    return;
  }
  callOrQueue(() => window.CrazyGames.SDK.game.gameplayStop());
}

/** Whether a gameplayStart() is currently unmatched by a gameplayStop() — used by main.js's tab-visibility handling. */
export function isInGameplay() {
  return inGameplay;
}

/** Use sparingly — top-2-rank result reveal, chain/daily summary completion. No Yandex equivalent — no-op on that target. */
export function happytime() {
  if (!isPortalBuild()) return;
  if (isYandexTarget()) return;
  callOrQueue(() => window.CrazyGames.SDK.game.happytime());
}

/** Test-only: resets all module state between test cases. Not used by app code. */
export function __resetForTest() {
  sdkReady = false;
  sdkBroken = false;
  queue = [];
  inGameplay = false;
  loadingStopped = false;
  ysdk = null;
}
