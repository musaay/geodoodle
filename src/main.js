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
  RotateCcw, Share2, Star, Sun, Target, Trash2, TrendingUp, Undo2, User, Users,
} from 'lucide';

// Only the icons the app actually uses, so the rest of the set is tree-shaken
const icons = {
  ArrowLeft, ArrowRight, BarChart2, Brain, Calendar, CheckCircle2, Eraser,
  Flame, Home, Lightbulb, Lock, Map, Moon, Paintbrush, Pen, PenTool,
  RotateCcw, Share2, Star, Sun, Target, Trash2, TrendingUp, Undo2, User, Users,
};
import { getLanguage } from './i18n.js';
import { GameState } from './engine/game-state.js';
import { HomeScreen } from './screens/home-screen.js';
import { LevelSelectScreen } from './screens/level-select.js';
import { GameScreen } from './screens/game-screen.js';
import { ResultScreen } from './screens/result-screen.js';
import { StatsScreen } from './screens/stats-screen.js';

import { HandoffScreen } from './screens/handoff-screen.js';

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
    this.gameState = new GameState();
    this.appEl = document.getElementById('app');
    this.currentScreen = null;
    this.toastTimeout = null;

    // Screen instances
    this.screens = {
      home: new HomeScreen(this),
      levelSelect: new LevelSelectScreen(this),
      game: new GameScreen(this),
      result: new ResultScreen(this),
      stats: new StatsScreen(this),
      handoff: new HandoffScreen(this),
    };

    // Apply saved theme
    document.documentElement.setAttribute('data-theme', this.gameState.getTheme());

    // Create top controls (theme & lang)
    this.createTopControls();

    // Show home screen
    this.showHome();

    // Register service worker
    this.registerSW();
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
        this.screens.game.drawingEngine.render();
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
