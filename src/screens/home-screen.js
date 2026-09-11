import { getRegionById, getAllRegions } from '../data/levels.js';
import { t, getLanguage } from '../i18n.js';
import { getDailyRegionPool, getDailyRegionIds, getDailyProgress, todayStr } from '../engine/daily.js';
import { track } from '../engine/analytics.js';

/**
 * HomeScreen - Main menu with game mode selection
 *
 * #32: rebuilt compact so the whole "what can I do" set (title, primary
 * CTA, mode selector, Daily Triple, Neighbor Chain) fits one 393×852
 * viewport with no scroll — #30 had already made the big Eğitim/Hafıza
 * cards redundant (they started/resumed the same run the primary button
 * does), so they're replaced here with the same compact two-way selector
 * Neighbor Chain's own card already used, and Daily/Chain are given equal,
 * single-status-line weight instead of the old multi-line cards.
 */
export class HomeScreen {
  constructor(app) {
    this.app = app;
  }

  render() {
    const stats = this.app.gameState.getStats();
    const el = document.createElement('div');
    el.className = 'screen ';
    el.id = 'home-screen';

    const dateStr = todayStr();
    const dailyRegionIds = getDailyRegionIds(dateStr, getDailyRegionPool(), 3);
    const dailyEntry = this.app.gameState.getDailyEntry(dateStr);
    const dailyProgress = getDailyProgress(dailyEntry, dailyRegionIds);
    const lang = getLanguage();
    const nextDailyRegion = dailyProgress.nextRegionId ? getRegionById(dailyProgress.nextRegionId) : null;
    const nextDailyRegionName = nextDailyRegion
      ? (lang === 'en' && nextDailyRegion.nameEn ? nextDailyRegion.nameEn : nextDailyRegion.name)
      : '';
    // Single status line per #32's design (was two lines: next region,
    // then a separate "N/3 played" line) — the played-count detail is
    // still visible once the player actually opens the daily flow.
    const dailyStatusLine = dailyProgress.isComplete
      ? t('daily_complete_today', { total: dailyProgress.total })
      : nextDailyRegionName;
    const dailyStreak = this.app.gameState.getDailyStreak();
    const bestChain = this.app.gameState.getBestChain();
    const chainStatusLine = bestChain
      ? t('chain_best', { links: bestChain.links, total: bestChain.total })
      : t('chain_desc');
    const chainMode = this.app.gameState.getChainMode();
    const runMode = this.app.gameState.getRunMode(); // #32 — distinct from chainMode, see game-state.js
    const activeRun = this.app.gameState.getActiveRun(); // #30
    // session.playerCount can be left at 2 from a prior round (no nav path
    // resets it) — derive both the toggle's visual state and the chain
    // card's visibility from the same value so they can't disagree.
    const playerCount = this.app.gameState.session.playerCount || 1;

    el.innerHTML = `
      <div class="home-hero" style="flex:1; display:flex; flex-direction:column; justify-content:center; align-items:center; padding-left: 1rem; padding-right: 1rem; padding-bottom: 1.5rem;">
        <div class="home-logo-icon animate-bounce-in" style="margin-bottom: 0.15rem;">
          <i data-lucide="map" style="width: 2.75rem; height: 2.75rem; color: var(--primary);"></i>
        </div>
        <h1 class="logo" style="font-size: 1.85rem;">GeoDoodle</h1>
        <p class="subtitle" style="margin-bottom: 0.85rem; font-size: 0.85rem;">${t('app_subtitle')}</p>

        <button class="btn btn-primary btn-lg animate-pop-in" data-action="run-primary" style="width: 100%; max-width: 400px; display: flex; align-items: center; justify-content: center; gap: 0.5rem; margin-bottom: 0.5rem;">
          <i data-lucide="flag"></i> ${activeRun ? t('run_continue') : t('run_start')}
        </button>

        <div id="run-mode-toggle" class="chain-mode-toggle animate-pop-in" style="display: flex; gap: 0.25rem; background: var(--bg-secondary); padding: 0.2rem; border-radius: var(--radius-sm); margin-bottom: 0.85rem;">
          <button class="chain-mode-btn ${runMode === 'trace' ? 'active' : ''}" data-action="run-mode-trace" style="padding: 0.4rem 1.75rem;"><h4 style="font-size: 0.8rem;">${t('mode_trace')}</h4></button>
          <button class="chain-mode-btn ${runMode === 'blind' ? 'active' : ''}" data-action="run-mode-blind" style="padding: 0.4rem 1.75rem;"><h4 style="font-size: 0.8rem;">${t('mode_blind')}</h4></button>
        </div>

        <div class="card daily-card animate-pop-in" data-action="daily" style="width: 100%; max-width: 400px; padding: 0.65rem 0.85rem; cursor: pointer; display: flex; align-items: center; gap: 0.65rem; text-align: left;">
          <i data-lucide="calendar" style="color: var(--accent-primary); width: 1.4rem; height: 1.4rem; flex-shrink: 0;"></i>
          <div style="flex: 1; min-width: 0;">
            <div style="font-size: 0.85rem; font-weight: 600;">${t('daily_title')}</div>
            <div style="font-size: 0.75rem; color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${dailyStatusLine}</div>
          </div>
          ${dailyStreak >= 1 ? `
            <span style="display: flex; align-items: center; gap: 0.2rem; color: var(--warning, #f39c12); font-weight: 600; font-size: 0.8rem; flex-shrink: 0;">
              <i data-lucide="flame" style="width: 1rem; height: 1rem;"></i>${dailyStreak}
            </span>
          ` : ''}
        </div>

        <div id="chain-card" class="card animate-pop-in" data-action="chain" style="width: 100%; max-width: 400px; padding: 0.65rem 0.85rem; margin-top: 0.4rem; cursor: pointer; display: flex; align-items: center; gap: 0.65rem; text-align: left;">
          <i data-lucide="route" style="color: var(--accent-primary); width: 1.4rem; height: 1.4rem; flex-shrink: 0;"></i>
          <div style="flex: 1; min-width: 0;">
            <div style="font-size: 0.85rem; font-weight: 600;">${t('chain_title')}</div>
            <div style="font-size: 0.75rem; color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${chainStatusLine}</div>
          </div>
          <div class="chain-mode-toggle" style="display: flex; gap: 0.2rem; background: var(--bg-secondary); padding: 0.15rem; border-radius: var(--radius-sm); flex-shrink: 0;">
            <button class="chain-mode-btn ${chainMode === 'trace' ? 'active' : ''}" data-action="chain-mode-trace" style="padding: 0.3rem 0.55rem;"><h4 style="font-size: 0.7rem;">${t('mode_trace')}</h4></button>
            <button class="chain-mode-btn ${chainMode === 'blind' ? 'active' : ''}" data-action="chain-mode-blind" style="padding: 0.3rem 0.55rem;"><h4 style="font-size: 0.7rem;">${t('mode_blind')}</h4></button>
          </div>
        </div>

        <div style="margin-top: 0.75rem; display: flex; flex-direction: column; align-items: center; gap: 0.3rem;">
          <h3 style="font-size: 0.8rem; color: var(--text-secondary);">${t('player_count')}</h3>
          <div style="display: flex; gap: 1rem; background: var(--bg-secondary); padding: 0.2rem; border-radius: var(--radius-sm);">
            <div class="player-card ${playerCount === 2 ? '' : 'active'}" data-action="player-1" style="padding: 0.4rem 0.85rem;">
              <span class="icon" style="display: flex; align-items: center;"><i data-lucide="user"></i></span>
              <h4>${t('player_1')}</h4>
            </div>
            <div class="player-card ${playerCount === 2 ? 'active' : ''}" data-action="player-2" style="padding: 0.4rem 0.85rem;">
              <span class="icon" style="display: flex; align-items: center;"><i data-lucide="users"></i></span>
              <h4>${t('player_2')}</h4>
            </div>
          </div>
        </div>

        <div style="display: flex; gap: 1.25rem; margin-top: 0.75rem; font-size: 0.8rem;">
          <button data-action="levels" style="background: none; border: none; cursor: pointer; padding: 0; color: var(--text-secondary); text-decoration: underline; display: flex; align-items: center; gap: 0.3rem; font-size: inherit; font-family: inherit;">
            <i data-lucide="target" style="width: 0.9rem; height: 0.9rem;"></i>${t('go_to_levels')}
          </button>
          <button data-action="stats" style="background: none; border: none; cursor: pointer; padding: 0; color: var(--text-secondary); text-decoration: underline; display: flex; align-items: center; gap: 0.3rem; font-size: inherit; font-family: inherit;">
            <i data-lucide="bar-chart-2" style="width: 0.9rem; height: 0.9rem;"></i>${t('statistics')}${stats.totalDrawings > 0 ? ` (${stats.regionsCompleted})` : ''}
          </button>
        </div>

        <div class="fun-fact animate-fade-in" style="margin-top: 1rem; max-width: 400px; display: flex; align-items: center; gap: 0.5rem;">
          <i data-lucide="lightbulb" style="color: var(--warning, #f39c12);"></i>
          <span>${t('fun_fact', { count: getAllRegions().length })}</span>
        </div>

        ${import.meta.env.VITE_PORTAL === '1' ? '' : `<a href="/privacy/" style="margin-top: 1rem; color: var(--text-secondary); font-size: 0.75rem; text-decoration: underline;">${t('privacy_link')}</a>`}
      </div>
    `;

    // Event listeners
    const chainCard = el.querySelector('#chain-card');
    const updateChainAvailability = () => {
      // The card has an inline `display: flex` (see markup above), which
      // beats the `[hidden]` UA stylesheet rule — toggle display directly.
      chainCard.style.display = this.app.gameState.session.playerCount === 2 ? 'none' : 'flex';
    };
    updateChainAvailability();

    const playerCards = el.querySelectorAll('.player-card');
    el.querySelector('[data-action="player-1"]').addEventListener('click', (e) => {
      playerCards.forEach(c => c.classList.remove('active'));
      e.currentTarget.classList.add('active');
      this.app.gameState.session.playerCount = 1;
      updateChainAvailability();
    });
    el.querySelector('[data-action="player-2"]').addEventListener('click', (e) => {
      playerCards.forEach(c => c.classList.remove('active'));
      e.currentTarget.classList.add('active');
      this.app.gameState.session.playerCount = 2;
      updateChainAvailability();
    });

    // #30/#32: the primary CTA starts (or resumes) a Sefer/Run in whatever
    // mode the compact selector above has picked, single player — a run
    // can't be 2-player. In 2-player mode there's no run to start, so this
    // preserves the pre-#32 mode cards' OTHER job for that case: route to
    // level select in the selected mode (unchanged 2-player behavior,
    // acceptance criterion #4).
    el.querySelector('[data-action="run-primary"]').addEventListener('click', () => {
      this.app.gameState.session.currentPlayer = 1;
      if (this.app.gameState.session.playerCount === 2) {
        this.app.showLevelSelect(this.app.gameState.getRunMode());
        return;
      }
      this.app.gameState.session.playerCount = 1;
      if (this.app.gameState.getActiveRun()) {
        this.app.resumeRun();
      } else {
        this.app.startRun(this.app.gameState.getRunMode());
      }
    });

    // Run-mode selector (#32) — sets the persisted preference only; the
    // primary button above reads it at click time. Scoped to its own
    // container so it can reuse `.chain-mode-btn`'s existing look without
    // its active-class toggling colliding with the Neighbor Chain card's
    // OWN, separately-scoped pair of the same class below.
    const runModeToggle = el.querySelector('#run-mode-toggle');
    const runModeBtns = runModeToggle.querySelectorAll('.chain-mode-btn');
    runModeToggle.querySelector('[data-action="run-mode-trace"]').addEventListener('click', () => {
      runModeBtns.forEach(b => b.classList.remove('active'));
      runModeToggle.querySelector('[data-action="run-mode-trace"]').classList.add('active');
      this.app.gameState.setRunMode('trace');
    });
    runModeToggle.querySelector('[data-action="run-mode-blind"]').addEventListener('click', () => {
      runModeBtns.forEach(b => b.classList.remove('active'));
      runModeToggle.querySelector('[data-action="run-mode-blind"]').classList.add('active');
      this.app.gameState.setRunMode('blind');
    });

    if (dailyRegionIds.length > 0) {
      el.querySelector('[data-action="daily"]').addEventListener('click', () => {
        if (dailyProgress.isComplete) {
          this.app.showDailySummary({
            regionIds: dailyRegionIds,
            scores: dailyEntry?.scores || {},
            total: dailyProgress.total,
            streak: dailyStreak,
          });
          return;
        }
        track('daily_open', { progress: `${dailyProgress.playedCount}/3`, from: 'home' });
        this.app.enterDaily(dailyProgress.nextRegionId);
      });
    }
    const chainModeBtns = chainCard.querySelectorAll('.chain-mode-btn');
    el.querySelector('[data-action="chain-mode-trace"]').addEventListener('click', (e) => {
      e.stopPropagation();
      chainModeBtns.forEach(b => b.classList.remove('active'));
      e.currentTarget.classList.add('active');
      this.app.gameState.setChainMode('trace');
    });
    el.querySelector('[data-action="chain-mode-blind"]').addEventListener('click', (e) => {
      e.stopPropagation();
      chainModeBtns.forEach(b => b.classList.remove('active'));
      e.currentTarget.classList.add('active');
      this.app.gameState.setChainMode('blind');
    });
    chainCard.addEventListener('click', () => {
      if (this.app.gameState.session.playerCount === 2) return;
      this.app.startChain(this.app.gameState.getChainMode(), { from: 'home' });
    });

    el.querySelector('[data-action="levels"]').addEventListener('click', () => {
      this.app.showLevelSelect();
    });
    el.querySelector('[data-action="stats"]').addEventListener('click', () => {
      this.app.showStats();
    });

    return el;
  }
}
