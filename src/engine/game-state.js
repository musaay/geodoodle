import { levels } from '../data/levels.js';
import { setLanguage } from '../i18n.js';
import {
  computeStreak, todayStr, getDailyRegionPool, getDailyRegionIds,
  normalizeDailyEntry, getDailyProgress,
} from './daily.js';
import { setSoundEnabled as syncAudioEngineSoundEnabled } from './audio-engine.js';

const STORAGE_KEY = 'geodoodle_state';

const DEFAULT_STATE = {
  theme: 'day',
  completedRegions: {},
  totalDrawings: 0,
  hintsUsed: 0,
  unlockedLevels: [1],
  firstTime: true,
  onboardingSeen: false,
  soundEnabled: true,
  language: 'tr',
  // 'YYYY-MM-DD' -> { scores: {regionId: bestScore}, total } (#17). Older
  // entries may still be the pre-#17 shape { regionId, score } — always read
  // through normalizeDailyEntry()/getDailyEntry() rather than this directly.
  daily: {},
  bestChain: null, // { links, total, date } — best-ever Neighbor Chain run (#15)
  chainMode: 'trace', // last mode chosen on the Neighbor Chain home card (#15)
};

/**
 * A fresh copy of DEFAULT_STATE with its own nested containers. Plain
 * `{ ...DEFAULT_STATE }` only shallow-copies — `daily`/`completedRegions`/
 * `unlockedLevels` would stay the SAME object/array shared by every
 * GameState instance that falls back to it, so writes on one instance
 * (`this.state.daily[date] = ...`) would silently corrupt DEFAULT_STATE
 * itself for every instance created afterward in the same JS session.
 * Always build a state object through this, never spread DEFAULT_STATE directly.
 */
function freshDefaultState() {
  return {
    ...DEFAULT_STATE,
    completedRegions: {},
    unlockedLevels: [...DEFAULT_STATE.unlockedLevels],
    daily: {},
  };
}

/**
 * Picks a starting language for a true first run, from the browser's
 * reported language(s) — Turkish if any of them is a `tr*` locale,
 * English otherwise. Falls back to the 'tr' default when `navigator` isn't
 * available at all (older environments, or this project's DOM-free tests).
 */
export function detectBrowserLanguage() {
  if (typeof navigator === 'undefined') return 'tr';

  const candidates = [
    ...(Array.isArray(navigator.languages) ? navigator.languages : []),
    ...(navigator.language ? [navigator.language] : []),
  ];
  if (candidates.some((l) => typeof l === 'string' && l.toLowerCase().startsWith('tr'))) {
    return 'tr';
  }
  return candidates.length > 0 ? 'en' : 'tr';
}

/**
 * GameState - Manages all game state with LocalStorage persistence
 * Reactive event system for UI updates
 */
export class GameState {
  constructor() {
    this.state = this.load();
    syncAudioEngineSoundEnabled(this.state.soundEnabled);
    this.listeners = new Set();
    this.session = {
      playerCount: 1,
      currentPlayer: 1,
      p1Score: null,
      p2Score: null,
      currentRegionId: null,
      currentMode: null,
      isDaily: false,
      chain: null, // { active, mode, links: [{region,score,value}], multiplier, total } — Neighbor Chain (#15)
    };
  }

  load() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const loadedState = { ...freshDefaultState(), ...JSON.parse(saved) };
        setLanguage(loadedState.language);
        return loadedState;
      }
    } catch (e) {
      console.warn('Failed to load game state:', e);
    }
    // True first run — no saved preference to respect, so pick the language
    // from the browser instead of always defaulting to Turkish.
    const state = { ...freshDefaultState(), language: detectBrowserLanguage() };
    setLanguage(state.language);
    return state;
  }

  save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch (e) {
      console.warn('Failed to save game state:', e);
    }
    this.notify();
  }

  // Event system for reactive UI
  onChange(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  notify() {
    for (const cb of this.listeners) {
      try { cb(this.state); } catch (e) { console.warn('State listener error:', e); }
    }
  }

  // Theme
  getTheme() {
    return this.state.theme;
  }

  getLanguage() {
    return this.state.language;
  }

  toggleLanguage() {
    this.state.language = this.state.language === 'tr' ? 'en' : 'tr';
    setLanguage(this.state.language);
    this.save();
  }

  setTheme(theme) {
    this.state.theme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    this.save();
  }

  toggleTheme() {
    this.setTheme(this.state.theme === 'day' ? 'night' : 'day');
  }

  // Region completion
  completeRegion(regionId, score, rank) {
    const existing = this.state.completedRegions[regionId];
    const isNewBest = !existing || score > existing.bestScore;

    this.state.completedRegions[regionId] = {
      bestScore: isNewBest ? score : existing.bestScore,
      bestRank: isNewBest ? rank.name : existing.bestRank,
      attempts: (existing?.attempts || 0) + 1,
      lastPlayed: Date.now(),
    };

    this.state.totalDrawings++;
    this.checkLevelUnlocks();
    this.save();

    return isNewBest;
  }

  getRegionResult(regionId) {
    return this.state.completedRegions[regionId] || null;
  }

  getBestScore(regionId) {
    return this.state.completedRegions[regionId]?.bestScore || 0;
  }

  // Level progression
  isLevelUnlocked(levelId) {
    return this.state.unlockedLevels.includes(levelId);
  }

  unlockLevel(levelId) {
    if (!this.state.unlockedLevels.includes(levelId)) {
      this.state.unlockedLevels.push(levelId);
      this.save();
    }
  }

  checkLevelUnlocks() {
    const totalStars = this.getTotalStars();
    for (const level of levels) {
      if (!this.state.unlockedLevels.includes(level.id) && totalStars >= level.requiredStars) {
        this.state.unlockedLevels.push(level.id);
      }
    }
  }

  getTotalStars() {
    let stars = 0;
    for (const region of Object.values(this.state.completedRegions)) {
      if (region.bestScore >= 81) stars += 3;
      else if (region.bestScore >= 51) stars += 2;
      else if (region.bestScore > 0) stars += 1;
    }
    return stars;
  }

  // Daily Triple (#17) — was a single daily region pre-#17; `daily[date]` is
  // now `{ scores: {regionId: bestScore}, total }`, best-of-day per region.
  recordDailyResult(regionId, score) {
    const date = todayStr();
    const existing = normalizeDailyEntry(this.state.daily[date]) || { scores: {}, total: 0 };
    const prevScore = existing.scores[regionId] || 0;
    if (score > prevScore) {
      const scores = { ...existing.scores, [regionId]: score };
      this.state.daily[date] = {
        scores,
        total: Object.values(scores).reduce((sum, s) => sum + s, 0),
      };
    }
    this.save();
  }

  /** Normalized `{ scores, total }` for a date, or `null` if nothing was played that day. */
  getDailyEntry(dateStr) {
    return normalizeDailyEntry(this.state.daily[dateStr]);
  }

  /**
   * A day counts toward the streak once its whole Daily Triple set is
   * complete — except pre-#17 days, which only ever had one region and are
   * grandfathered in as "played" so migrating to the 3-region set doesn't
   * retroactively break streaks people already built.
   */
  getDailyStreak() {
    const pool = getDailyRegionPool();
    const playedDates = Object.entries(this.state.daily)
      .filter(([date, raw]) => {
        const isPreV17Shape = raw && raw.regionId != null && !raw.scores;
        if (isPreV17Shape) return true;
        const normalized = normalizeDailyEntry(raw);
        if (!normalized) return false;
        const regionIds = getDailyRegionIds(date, pool, 3);
        return getDailyProgress(normalized, regionIds).isComplete;
      })
      .map(([date]) => date);
    return computeStreak(playedDates, todayStr());
  }

  // Neighbor Chain (#15)
  getBestChain() {
    return this.state.bestChain || null;
  }

  getChainMode() {
    return this.state.chainMode || 'trace';
  }

  setChainMode(mode) {
    if (mode !== 'trace' && mode !== 'blind') return;
    this.state.chainMode = mode;
    this.save();
  }

  /** Records a finished chain's result, keeping it only if it beats the current best (by total). Returns whether it's a new best. */
  recordChainResult(linkCount, total) {
    const existing = this.state.bestChain;
    const isNewBest = !existing || total > existing.total;
    if (isNewBest) {
      this.state.bestChain = { links: linkCount, total, date: todayStr() };
      this.save();
    }
    return isNewBest;
  }

  // Hints (per-game allowance lives in GameScreen; this is the lifetime counter)
  recordHintUsed() {
    this.state.hintsUsed = (this.state.hintsUsed || 0) + 1;
    this.save();
  }

  // Stats
  getStats() {
    const completed = Object.values(this.state.completedRegions);
    const scores = completed.map(r => r.bestScore).filter(s => s > 0);

    return {
      totalDrawings: this.state.totalDrawings,
      totalStars: this.getTotalStars(),
      regionsCompleted: completed.length,
      averageScore: scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0,
      bestScore: scores.length > 0 ? Math.max(...scores) : 0,
      bestRegion: this.getBestRegion(),
      hintsUsed: this.state.hintsUsed || 0,
    };
  }

  getBestRegion() {
    let bestId = null;
    let bestScore = 0;
    for (const [id, data] of Object.entries(this.state.completedRegions)) {
      if (data.bestScore > bestScore) {
        bestScore = data.bestScore;
        bestId = id;
      }
    }
    return bestId;
  }

  isFirstTime() {
    if (this.state.firstTime) {
      this.state.firstTime = false;
      this.save();
      return true;
    }
    return false;
  }

  // Game screen onboarding overlay (shown once, re-armed by resetAll)
  hasSeenOnboarding() {
    return !!this.state.onboardingSeen;
  }

  setOnboardingSeen() {
    this.state.onboardingSeen = true;
    this.save();
  }

  // Sound effects toggle
  isSoundEnabled() {
    return this.state.soundEnabled;
  }

  setSoundEnabled(enabled) {
    this.state.soundEnabled = enabled;
    syncAudioEngineSoundEnabled(enabled);
    this.save();
  }

  resetAll() {
    this.state = freshDefaultState();
    syncAudioEngineSoundEnabled(this.state.soundEnabled);
    localStorage.removeItem(STORAGE_KEY);
    this.save();
  }
}
