import { getRegionById, getAllRegions } from '../data/levels.js';
import { t, getLanguage } from '../i18n.js';
import { getDailyRegionPool, getDailyRegionIds, getDailyProgress, todayStr } from '../engine/daily.js';
import { track } from '../engine/analytics.js';

/**
 * HomeScreen - Main menu with game mode selection
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
    const dailyStreak = this.app.gameState.getDailyStreak();
    const bestChain = this.app.gameState.getBestChain();
    const chainMode = this.app.gameState.getChainMode();
    // session.playerCount can be left at 2 from a prior round (no nav path
    // resets it) — derive both the toggle's visual state and the chain
    // card's visibility from the same value so they can't disagree.
    const playerCount = this.app.gameState.session.playerCount || 1;

    el.innerHTML = `
      <div style="flex:1; display:flex; flex-direction:column; justify-content:center; align-items:center; padding: 2rem 1rem;">
        <div class="animate-bounce-in" style="margin-bottom: 0.5rem; display: flex; justify-content: center;">
          <i data-lucide="map" style="width: 4rem; height: 4rem; color: var(--primary);"></i>
        </div>
        <h1 class="logo">GeoDoodle</h1>
        <p class="subtitle">${t('app_subtitle')}</p>

        <div class="home-modes">
          <div class="mode-card animate-pop-in" data-action="mode-trace" style="animation-delay: 0.1s;">
            <span class="icon"><i data-lucide="pen-tool"></i></span>
            <h3>${t('mode_trace')}</h3>
            <p>${t('mode_trace_desc')}</p>
          </div>
          <div class="mode-card animate-pop-in" data-action="mode-blind" style="animation-delay: 0.2s;">
            <span class="icon"><i data-lucide="brain"></i></span>
            <h3>${t('mode_blind')}</h3>
            <p>${t('mode_blind_desc')}</p>
          </div>
        </div>

        <div class="card daily-card animate-pop-in" data-action="daily" style="animation-delay: 0.25s; width: 100%; max-width: 400px; margin-top: 1rem; cursor: pointer; display: flex; align-items: center; gap: 1rem; text-align: left;">
          <span class="icon" style="display: flex; align-items: center;"><i data-lucide="calendar" style="color: var(--accent-primary); width: 2rem; height: 2rem; flex-shrink: 0;"></i></span>
          <div style="flex: 1; min-width: 0;">
            <h3 style="font-size: 1rem; margin: 0;">${t('daily_title')}</h3>
            ${dailyProgress.isComplete
              ? `<p style="margin: 0.15rem 0 0; color: var(--text-secondary); font-size: 0.9rem;">${t('daily_complete_today', { total: dailyProgress.total })}</p>`
              : `
                <p style="margin: 0.15rem 0 0; color: var(--text-secondary); font-size: 0.9rem;">${nextDailyRegionName}</p>
                ${dailyProgress.playedCount > 0 ? `<p style="margin: 0.15rem 0 0; color: var(--text-secondary); font-size: 0.8rem;">${t('daily_progress', { played: dailyProgress.playedCount })}</p>` : ''}
              `}
          </div>
          ${dailyStreak >= 1 ? `
            <span style="display: flex; align-items: center; gap: 0.25rem; color: var(--warning, #f39c12); font-weight: 600; flex-shrink: 0;">
              <i data-lucide="flame" style="width: 1.1rem; height: 1.1rem;"></i>${t('daily_streak', { count: dailyStreak })}
            </span>
          ` : ''}
        </div>

        <div id="chain-card" class="card animate-pop-in" data-action="chain" style="animation-delay: 0.28s; width: 100%; max-width: 400px; margin-top: 0.75rem; cursor: pointer; display: flex; align-items: center; gap: 1rem; text-align: left;">
          <span class="icon" style="display: flex; align-items: center;"><i data-lucide="route" style="color: var(--accent-primary); width: 2rem; height: 2rem; flex-shrink: 0;"></i></span>
          <div style="flex: 1; min-width: 0;">
            <h3 style="font-size: 1rem; margin: 0;">${t('chain_title')}</h3>
            <p style="margin: 0.15rem 0 0; color: var(--text-secondary); font-size: 0.85rem;">${t('chain_desc')}</p>
            ${bestChain ? `<p style="margin: 0.15rem 0 0; color: var(--text-secondary); font-size: 0.8rem;">${t('chain_best', { links: bestChain.links, total: bestChain.total })}</p>` : ''}
          </div>
          <div class="chain-mode-toggle" style="display: flex; gap: 0.25rem; background: var(--bg-secondary); padding: 0.2rem; border-radius: var(--radius-sm); flex-shrink: 0;">
            <button class="chain-mode-btn ${chainMode === 'trace' ? 'active' : ''}" data-action="chain-mode-trace" style="padding: 0.35rem 0.6rem;"><h4 style="font-size: 0.75rem;">${t('mode_trace')}</h4></button>
            <button class="chain-mode-btn ${chainMode === 'blind' ? 'active' : ''}" data-action="chain-mode-blind" style="padding: 0.35rem 0.6rem;"><h4 style="font-size: 0.75rem;">${t('mode_blind')}</h4></button>
          </div>
        </div>

        <div style="margin-top: 1.5rem; display: flex; flex-direction: column; align-items: center; gap: 0.5rem;">
          <h3 style="font-size: 1rem; color: var(--text-secondary);">${t('player_count')}</h3>
          <div style="display: flex; gap: 1rem; background: var(--bg-secondary); padding: 0.25rem; border-radius: var(--radius-sm);">
            <div class="player-card ${playerCount === 2 ? '' : 'active'}" data-action="player-1">
              <span class="icon" style="display: flex; align-items: center;"><i data-lucide="user"></i></span>
              <h4>${t('player_1')}</h4>
            </div>
            <div class="player-card ${playerCount === 2 ? 'active' : ''}" data-action="player-2">
              <span class="icon" style="display: flex; align-items: center;"><i data-lucide="users"></i></span>
              <h4>${t('player_2')}</h4>
            </div>
          </div>
        </div>

        <div class="home-actions animate-fade-in" style="animation-delay: 0.3s; width: 100%; max-width: 400px; margin-top: 2rem;">
          <button class="btn btn-primary btn-lg" data-action="levels" style="width: 100%; display: flex; align-items: center; justify-content: center; gap: 0.5rem;">
            <i data-lucide="target"></i> ${t('go_to_levels')}
          </button>
          <button class="btn btn-secondary" data-action="stats" style="width: 100%; display: flex; align-items: center; justify-content: center; gap: 0.5rem;">
            <i data-lucide="bar-chart-2"></i> ${t('statistics')} ${stats.totalDrawings > 0 ? `(${stats.regionsCompleted} ${t('regions')})` : ''}
          </button>
        </div>

        <div class="fun-fact animate-fade-in" style="animation-delay: 0.5s; max-width: 400px; display: flex; align-items: center; gap: 0.5rem;">
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

    el.querySelector('[data-action="mode-trace"]').addEventListener('click', () => {
      this.app.gameState.session.currentPlayer = 1;
      this.app.showLevelSelect('trace');
    });
    el.querySelector('[data-action="mode-blind"]').addEventListener('click', () => {
      this.app.gameState.session.currentPlayer = 1;
      this.app.showLevelSelect('blind');
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
        track('daily_open', { progress: `${dailyProgress.playedCount}/3` });
        this.app.enterDaily(dailyProgress.nextRegionId);
      });
    }
    const chainModeBtns = el.querySelectorAll('.chain-mode-btn');
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
      this.app.startChain(this.app.gameState.getChainMode());
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
