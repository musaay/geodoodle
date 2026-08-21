import { levels, getRegionById } from '../data/levels.js';
import { t, getLanguage } from '../i18n.js';
import { getDailyRegionPool, getDailyRegionId, todayStr } from '../engine/daily.js';

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
    const dailyPool = getDailyRegionPool();
    const dailyRegionId = getDailyRegionId(dateStr, dailyPool);
    const dailyRegion = dailyRegionId ? getRegionById(dailyRegionId) : null;
    const lang = getLanguage();
    const dailyRegionName = dailyRegion
      ? (lang === 'en' && dailyRegion.nameEn ? dailyRegion.nameEn : dailyRegion.name)
      : '';
    const dailyRecord = this.app.gameState.getDailyRecord(dateStr);
    const dailyStreak = this.app.gameState.getDailyStreak();

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
            <p style="margin: 0.15rem 0 0; color: var(--text-secondary); font-size: 0.9rem;">${dailyRegionName}</p>
            ${dailyRecord ? `<p style="margin: 0.15rem 0 0; color: var(--text-secondary); font-size: 0.8rem;">${t('daily_today_score', { score: dailyRecord.score })}</p>` : ''}
          </div>
          ${dailyStreak >= 1 ? `
            <span style="display: flex; align-items: center; gap: 0.25rem; color: var(--warning, #f39c12); font-weight: 600; flex-shrink: 0;">
              <i data-lucide="flame" style="width: 1.1rem; height: 1.1rem;"></i>${t('daily_streak', { count: dailyStreak })}
            </span>
          ` : ''}
        </div>

        <div style="margin-top: 1.5rem; display: flex; flex-direction: column; align-items: center; gap: 0.5rem;">
          <h3 style="font-size: 1rem; color: var(--text-secondary);">${t('player_count')}</h3>
          <div style="display: flex; gap: 1rem; background: var(--bg-secondary); padding: 0.25rem; border-radius: var(--radius-sm);">
            <div class="player-card active" data-action="player-1">
              <span class="icon" style="display: flex; align-items: center;"><i data-lucide="user"></i></span>
              <h4>${t('player_1')}</h4>
            </div>
            <div class="player-card" data-action="player-2">
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
          <span>${t('fun_fact', { count: levels.reduce((sum, l) => sum + l.regions.length, 0) })}</span>
        </div>
      </div>
    `;

    // Event listeners
    const playerCards = el.querySelectorAll('.player-card');
    el.querySelector('[data-action="player-1"]').addEventListener('click', (e) => {
      playerCards.forEach(c => c.classList.remove('active'));
      e.currentTarget.classList.add('active');
      this.app.gameState.session.playerCount = 1;
    });
    el.querySelector('[data-action="player-2"]').addEventListener('click', (e) => {
      playerCards.forEach(c => c.classList.remove('active'));
      e.currentTarget.classList.add('active');
      this.app.gameState.session.playerCount = 2;
    });

    el.querySelector('[data-action="mode-trace"]').addEventListener('click', () => {
      this.app.gameState.session.currentPlayer = 1;
      this.app.showLevelSelect('trace');
    });
    el.querySelector('[data-action="mode-blind"]').addEventListener('click', () => {
      this.app.gameState.session.currentPlayer = 1;
      this.app.showLevelSelect('blind');
    });
    if (dailyRegionId) {
      el.querySelector('[data-action="daily"]').addEventListener('click', () => {
        const session = this.app.gameState.session;
        session.playerCount = 1;
        session.currentPlayer = 1;
        session.isDaily = true;
        this.app.startGame(dailyRegionId, 'blind');
      });
    }
    el.querySelector('[data-action="levels"]').addEventListener('click', () => {
      this.app.showLevelSelect();
    });
    el.querySelector('[data-action="stats"]').addEventListener('click', () => {
      this.app.showStats();
    });

    return el;
  }
}
