import { levels } from '../data/levels.js';
import { setLanguage } from '../i18n.js';
import { computeStreak, todayStr } from './daily.js';
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
  daily: {}, // 'YYYY-MM-DD' -> { regionId, score }
};

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
    };
  }

  load() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const loadedState = { ...DEFAULT_STATE, ...JSON.parse(saved) };
        setLanguage(loadedState.language);
        return loadedState;
      }
    } catch (e) {
      console.warn('Failed to load game state:', e);
    }
    // True first run — no saved preference to respect, so pick the language
    // from the browser instead of always defaulting to Turkish.
    const state = { ...DEFAULT_STATE, language: detectBrowserLanguage() };
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

  // Daily Challenge
  recordDailyResult(regionId, score) {
    const date = todayStr();
    const existing = this.state.daily[date];
    if (!existing || score > existing.score) {
      this.state.daily[date] = { regionId, score };
    }
    this.save();
  }

  getDailyRecord(dateStr) {
    return this.state.daily[dateStr] || null;
  }

  getDailyStreak() {
    return computeStreak(Object.keys(this.state.daily), todayStr());
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
    this.state = { ...DEFAULT_STATE };
    syncAudioEngineSoundEnabled(this.state.soundEnabled);
    localStorage.removeItem(STORAGE_KEY);
    this.save();
  }
}
