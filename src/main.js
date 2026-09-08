// Self-hosted font (was Google Fonts CDN) — weights used across the UI
import '@fontsource/outfit/300.css';
import '@fontsource/outfit/400.css';
import '@fontsource/outfit/500.css';
import '@fontsource/outfit/600.css';
import '@fontsource/outfit/700.css';

import './styles/index.css';
import './styles/animations.css';
import {
  createIcons,
  ArrowLeft, ArrowRight, BarChart2, Brain, Calendar, CheckCircle2, Eraser,
  Flame, Home, Lightbulb, Lock, Map, Moon, Paintbrush, Pen, PenTool,
  RotateCcw, Route, Share2, Star, Sun, Target, Trash2, TrendingUp, Undo2, User, Users,
  Volume2, VolumeX,
} from 'lucide';

// Only the icons the app actually uses, so the rest of the set is tree-shaken
const icons = {
  ArrowLeft, ArrowRight, BarChart2, Brain, Calendar, CheckCircle2, Eraser,
  Flame, Home, Lightbulb, Lock, Map, Moon, Paintbrush, Pen, PenTool,
  RotateCcw, Route, Share2, Star, Sun, Target, Trash2, TrendingUp, Undo2, User, Users,
  Volume2, VolumeX,
};
import { getLanguage } from './i18n.js';
import { GameState } from './engine/game-state.js';
import { parseDeepLink } from './engine/deep-link.js';
import {
  getDailyRegionPool, getDailyRegionId, getDailyRegionIds, getDailyProgress, todayStr,
} from './engine/daily.js';
import { getRegionById, levels } from './data/levels.js';
import { track } from './engine/analytics.js';
import { createErrorTracker } from './engine/error-tracker.js';
import { createChain } from './engine/chain-engine.js';
import { HomeScreen } from './screens/home-screen.js';
import { LevelSelectScreen } from './screens/level-select.js';
import { GameScreen } from './screens/game-screen.js';
import { ResultScreen } from './screens/result-screen.js';
import { StatsScreen } from './screens/stats-screen.js';
import { ChainSummaryScreen } from './screens/chain-summary-screen.js';
import { DailySummaryScreen } from './screens/daily-summary-screen.js';

import { HandoffScreen } from './screens/handoff-screen.js';
import * as portalSdk from './engine/portal-sdk.js';

// Bundled Lucide (was unpkg CDN). Screens keep calling window.lucide.createIcons();
// the shim always passes the bundled icon set along.
window.lucide = {
  createIcons: (options = {}) => createIcons({ icons, ...options }),
};

/**
 * GeoDoodle App - Main entry point and screen router
 */
class GeoDoodleApp {
  constructor() {
    // #23: as early as possible, before any geometry/data fetch — queued
    // internally (a no-op outside the portal build) until init() resolves.
    portalSdk.loadingStart();
    // Starts in the background; never blocks first paint (see
    // portal-sdk.js's own doc comment for the full init/queueing contract).
    portalSdk.init();

    this.gameState = new GameState();
    this.appEl = document.getElementById('app');
    this.currentScreen = null;
    this.toastTimeout = null;
    // #23: remembers a gameplay round paused by the tab going hidden, so it
    // can resume on return — see the visibilitychange listener below.
    this._resumeGameplayOnVisible = false;

    // Screen instances
    this.screens = {
      home: new HomeScreen(this),
      levelSelect: new LevelSelectScreen(this),
      game: new GameScreen(this),
      result: new ResultScreen(this),
      stats: new StatsScreen(this),
      handoff: new HandoffScreen(this),
      chainSummary: new ChainSummaryScreen(this),
      dailySummary: new DailySummaryScreen(this),
    };

    // Apply saved theme
    document.documentElement.setAttribute('data-theme', this.gameState.getTheme());

    // Create top controls (theme & lang)
    this.createTopControls();

    // Register service worker
    this.registerSW();

    // `?region=<id>&mode=<trace|blind>` or `?daily=1` — sends a shared link
    // straight into the game it points to, instead of the home screen.
    // Deep links always take priority over the portal's instant-play below.
    // Checked BEFORE rendering home (#23: so home is never rendered, however
    // briefly, only to be immediately replaced — that would make
    // loadingStop() below fire at the wrong "first screen interactive"
    // moment; GameScreen.initCanvas() calls it instead for these paths).
    const deepLinked = this.handleDeepLink();

    // Portal (CrazyGames etc.) only: skip the home screen entirely and drop
    // straight into a game, since the home → mode → level-list → game funnel
    // was the biggest drop-off point for that audience (issue #14). The web
    // build's behavior is untouched.
    if (!deepLinked && import.meta.env.VITE_PORTAL === '1') {
      this.startInstantPlay();
    }

    // Neither path above navigated anywhere — home is the actual first
    // screen shown. `this.currentScreen` is only ever set by navigateTo(),
    // so this reliably detects whether handleDeepLink()/startInstantPlay()
    // already redirected, without threading an extra return value through
    // either of them.
    if (!this.currentScreen) {
      this.showHome();
      // #23: home renders synchronously (no geometry fetch) — this IS the
      // "first screen interactive" moment. Idempotent (see portal-sdk.js):
      // when a redirect above navigated to a game screen instead,
      // GameScreen.initCanvas() calls loadingStop() there instead, and this
      // call simply never fires.
      portalSdk.loadingStop();
    }

    // Install once, regardless of build target — reports uncaught errors
    // and unhandled promise rejections to GA4, deduped and capped so a loop
    // can't spam analytics.
    this.installErrorTracking();

    // #23: portal gameplay-timer pause/resume on tab visibility.
    this.installVisibilityHandling();
  }

  /**
   * CrazyGames' gameplay timer should stop counting while the tab is
   * hidden (backgrounded/minimized) and resume when it's visible again,
   * ONLY if the player is still on the game screen — switching away to
   * another app mid-round shouldn't count as active play, but leaving the
   * hidden tab open past a Back/submit shouldn't spuriously restart it
   * either. A no-op outside the portal build (isInGameplay() is always
   * false there — see portal-sdk.js).
   */
  installVisibilityHandling() {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (portalSdk.isInGameplay()) {
          this._resumeGameplayOnVisible = true;
          portalSdk.gameplayStop();
        }
      } else if (this._resumeGameplayOnVisible) {
        this._resumeGameplayOnVisible = false;
        if (this.currentScreen?.id === 'game-screen') {
          portalSdk.gameplayStart();
        }
      }
    });
  }

  /** Sends a startup deep link straight into the game it points to. Returns whether it did. */
  handleDeepLink() {
    const link = parseDeepLink(window.location.search);
    if (!link) return false;

    const session = this.gameState.session;

    if (link.type === 'region') {
      // Ignore unknown region ids rather than crashing into a blank screen.
      if (!getRegionById(link.regionId)) return false;
      session.playerCount = 1;
      session.currentPlayer = 1;
      session.isDaily = false;
      // Deep-linked region games bypass the level star gate on purpose —
      // startGame() itself never checks unlock state (only LevelSelectScreen
      // does, by simply not wiring up a click handler for locked cards), so
      // no extra bypass is needed here.
      this.startGame(link.regionId, link.mode);
      return true;
    } else if (link.type === 'daily') {
      // Daily Triple (#17): jump straight into the next unplayed region of
      // today's 3-region set. If today's set is already complete, there's
      // nothing to jump into — fall through to the normal home screen
      // (which shows today's completed total) instead of forcing a replay.
      const dateStr = todayStr();
      const regionIds = getDailyRegionIds(dateStr, getDailyRegionPool(), 3);
      if (regionIds.length === 0) return false;
      const entry = this.gameState.getDailyEntry(dateStr);
      const progress = getDailyProgress(entry, regionIds);
      if (progress.isComplete) return false;
      this.enterDaily(progress.nextRegionId);
      return true;
    }
    return false;
  }

  /**
   * Portal-only instant play (issue #14): starts a trace-mode round in one
   * of the level-1 "easy" regions directly, rotating which one by day (via
   * the same date-hash used for the daily challenge) so repeat visitors see
   * variety rather than always landing on the same country.
   */
  startInstantPlay() {
    const easyLevel = levels.find((l) => l.id === 1);
    const regionId = getDailyRegionId(todayStr(), easyLevel.regions);
    if (!regionId) return;

    const session = this.gameState.session;
    session.playerCount = 1;
    session.currentPlayer = 1;
    session.isDaily = false;
    this.startGame(regionId, 'trace');
  }

  /**
   * Reports uncaught errors and unhandled promise rejections to GA4 as
   * `js_error`, deduped and capped (see error-tracker.js) so a repeating
   * failure can't spam analytics. Never lets a reporting mistake of its own
   * become a second error.
   */
  installErrorTracking() {
    const report = createErrorTracker(track);

    window.addEventListener('error', (event) => {
      try {
        const source = event?.filename ? `${event.filename}:${event.lineno}:${event.colno}` : '';
        report('error', event?.message, source);
      } catch (e) {
        // Never let the handler itself throw
      }
    });

    window.addEventListener('unhandledrejection', (event) => {
      try {
        const reason = event?.reason;
        const message = reason instanceof Error ? reason.message : String(reason);
        report('rejection', message);
      } catch (e) {
        // Never let the handler itself throw
      }
    });
  }

  /** Navigate to a new screen */
  navigateTo(screenEl) {
    // Remove old screen
    if (this.currentScreen) {
      this.currentScreen.remove();
    }

    this.appEl.appendChild(screenEl);
    this.currentScreen = screenEl;

    // Initialize Lucide icons on new screen
    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  showHome() {
    this.navigateTo(this.screens.home.render());
  }

  showLevelSelect(filterMode = null) {
    this.navigateTo(this.screens.levelSelect.render(filterMode));
  }

  startGame(regionId, mode) {
    this.navigateTo(this.screens.game.render(regionId, mode));
  }

  showHandoff() {
    this.navigateTo(this.screens.handoff.render());
  }

  showResult(region, result, mode, isNewBest) {
    this.navigateTo(this.screens.result.render(region, result, mode, isNewBest));
  }

  showStats() {
    this.navigateTo(this.screens.stats.render());
  }

  showChainSummary(summary) {
    this.navigateTo(this.screens.chainSummary.render(summary));
  }

  showDailySummary(summary) {
    this.navigateTo(this.screens.dailySummary.render(summary));
  }

  /**
   * Enters one round of the Daily Triple (#17) — always blind mode,
   * single player, regardless of whatever the home screen's own mode
   * selection or chain toggle is currently set to. Shared by the home
   * screen's daily card and the `?daily=1` deep link.
   */
  enterDaily(regionId) {
    const session = this.gameState.session;
    session.playerCount = 1;
    session.currentPlayer = 1;
    session.isDaily = true;
    this.startGame(regionId, 'blind');
  }

  /**
   * Starts a fresh Neighbor Chain (#15): single player, a random level-1
   * (easy) region as the starting link, in whichever mode the chain card's
   * own toggle was set to. Reused by both the home screen card and the
   * chain summary's "play again" button.
   */
  startChain(mode) {
    const easyLevel = levels.find((l) => l.id === 1);
    const regionId = easyLevel.regions[Math.floor(Math.random() * easyLevel.regions.length)];

    const session = this.gameState.session;
    session.playerCount = 1;
    session.currentPlayer = 1;
    session.isDaily = false;
    session.chain = createChain(mode);

    track('chain_start', { mode });
    this.startGame(regionId, mode);
  }

  /**
   * Ends an in-progress chain as abandoned (score/next-region-driven chain
   * ends are handled where they happen, in ResultScreen). Safe to call
   * unconditionally — no-ops when there's no active chain — so every
   * mid-chain "leave the game" path (game screen back button, result
   * screen retry/back-to-menu) can just call this before navigating.
   */
  abandonActiveChain() {
    const chain = this.gameState.session.chain;
    if (chain?.active) {
      track('chain_end', { links: chain.links.length, total: chain.total, reason: 'abandoned' });
      this.gameState.session.chain = null;
    }
  }

  /** Create fixed top controls (theme & language) */
  createTopControls() {
    const container = document.createElement('div');
    container.className = 'top-controls';

    // Theme toggle
    const themeBtn = document.createElement('button');
    themeBtn.className = 'icon-btn toggle-btn';
    themeBtn.id = 'theme-toggle';
    themeBtn.innerHTML = this.gameState.getTheme() === 'night' ? '<i data-lucide="sun"></i>' : '<i data-lucide="moon"></i>';
    themeBtn.addEventListener('click', () => {
      this.gameState.toggleTheme();
      themeBtn.innerHTML = this.gameState.getTheme() === 'night' ? '<i data-lucide="sun"></i>' : '<i data-lucide="moon"></i>';
      if (window.lucide) {
        window.lucide.createIcons({ root: themeBtn });
      }

      // Update drawing engine theme if game is active
      if (this.screens.game.drawingEngine) {
        this.screens.game.drawingEngine.setTheme(this.gameState.getTheme());
        this.screens.game.refreshContext(this.gameState.getTheme());
        this.screens.game.drawingEngine.render();
      }
    });

    // Sound toggle
    const soundBtn = document.createElement('button');
    soundBtn.className = 'icon-btn toggle-btn';
    soundBtn.id = 'sound-toggle';
    const soundIcon = () => this.gameState.isSoundEnabled() ? '<i data-lucide="volume-2"></i>' : '<i data-lucide="volume-x"></i>';
    soundBtn.innerHTML = soundIcon();
    soundBtn.addEventListener('click', () => {
      this.gameState.setSoundEnabled(!this.gameState.isSoundEnabled());
      soundBtn.innerHTML = soundIcon();
      if (window.lucide) {
        window.lucide.createIcons({ root: soundBtn });
      }
    });

    // Language toggle
    const langBtn = document.createElement('button');
    langBtn.className = 'text-btn toggle-btn';
    langBtn.id = 'lang-toggle';
    langBtn.innerText = this.gameState.getLanguage().toUpperCase();
    langBtn.addEventListener('click', () => {
      this.gameState.toggleLanguage();
      langBtn.innerText = this.gameState.getLanguage().toUpperCase();
      
      // Re-render current screen
      if (this.currentScreen) {
        const currentId = this.currentScreen.id;
        if (currentId === 'home-screen') this.showHome();
        else if (currentId === 'level-select-screen') this.showLevelSelect(this.screens.levelSelect.currentFilter);
        else if (currentId === 'stats-screen') this.showStats();
        // For game and result screens, we shouldn't fully re-render to avoid losing state, 
        // but for simplicity we will just let the user see translations on next screen or we can update specific elements.
        else if (currentId === 'game-screen') {
          if (this.screens.game.updateLanguage) {
            this.screens.game.updateLanguage();
          }
        }
      }
    });

    container.appendChild(langBtn);
    container.appendChild(soundBtn);
    container.appendChild(themeBtn);
    document.body.appendChild(container);
  }

  /** Show a toast notification */
  showToast(message) {
    // Remove existing
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();
    if (this.toastTimeout) clearTimeout(this.toastTimeout);

    const toast = document.createElement('div');
    toast.className = 'toast animate-slide-in-up';
    toast.textContent = message;
    document.body.appendChild(toast);

    this.toastTimeout = setTimeout(() => {
      toast.classList.add('animate-fade-out');
      setTimeout(() => toast.remove(), 400);
    }, 2500);
  }

  /** Register PWA service worker */
  async registerSW() {
    // Portal builds are hosted on someone else's origin — /sw.js wouldn't
    // resolve there, and there's no PWA install flow to support anyway.
    if (import.meta.env.VITE_PORTAL === '1') return;
    if ('serviceWorker' in navigator) {
      try {
        await navigator.serviceWorker.register('/sw.js');
      } catch (e) {
        // Service worker registration is optional
      }
    }
  }
}

// Boot the app
new GeoDoodleApp();
