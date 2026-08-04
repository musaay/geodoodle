import { getRegionById } from '../data/levels.js';
import { t, getLanguage } from '../i18n.js';

/**
 * StatsScreen - Player statistics and badge collection
 */
export class StatsScreen {
  constructor(app) {
    this.app = app;
  }

  render() {
    const stats = this.app.gameState.getStats();
    const bestRegion = stats.bestRegion ? getRegionById(stats.bestRegion) : null;
    const el = document.createElement('div');
    el.className = 'screen ';
    el.id = 'stats-screen';

    const lang = getLanguage();
    const rName = bestRegion ? (lang === 'en' && bestRegion.nameEn ? bestRegion.nameEn : bestRegion.name) : '—';

    el.innerHTML = `
      <div class="screen-header">
        <button class="btn btn-icon" data-action="back"><i data-lucide="arrow-left"></i></button>
        <h1 style="display:flex; align-items:center; gap:0.5rem;"><i data-lucide="bar-chart-2"></i> ${t('statistics')}</h1>
        <div style="width:44px"></div>
      </div>

      <div class="scroll-container">
        <div class="stats-grid animate-fade-in">
          <div class="stat-item">
            <span class="value">${stats.totalDrawings}</span>
            <span>${t('stats_total_drawings')}</span>
          </div>
          <div class="stat-item">
            <span class="value">${stats.totalStars}</span>
            <span>${t('stats_total_stars')} <i data-lucide="star" style="width: 14px; height: 14px; vertical-align: middle;"></i></span>
          </div>
          <div class="stat-item">
            <span class="value">${stats.regionsCompleted}</span>
            <span>${t('stats_regions_completed')}</span>
          </div>
          <div class="stat-item">
            <span class="value">%${stats.averageScore}</span>
            <span>${t('stats_avg_score')}</span>
          </div>
          <div class="stat-item">
            <span class="value">%${stats.bestScore}</span>
            <span>${t('stats_best_score')}</span>
          </div>
          <div class="stat-item">
            <span class="value">${rName}</span>
            <span>${t('stats_best_region')}</span>
          </div>
          <div class="stat-item">
            <span class="value">${stats.hintsUsed}</span>
            <span>${t('stats_hints_used')}</span>
          </div>
          <div class="stat-item">
            <span class="value">${this.app.gameState.getHintsRemaining()}</span>
            <span>${t('stats_hints_remaining')}</span>
          </div>
        </div>

        ${stats.totalDrawings > 0 ? `
          <div class="card animate-fade-in" style="animation-delay: 0.2s; margin-top: 1rem;">
            <h3 style="margin-bottom: 1rem; display:flex; align-items:center;"><i data-lucide="trending-up" style="display:inline-block; vertical-align:middle; width: 1.2rem; height: 1.2rem; margin-right: 0.5rem;"></i> ${t('stats_progress')}</h3>
            <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
              <span>${t('stats_overall_progress')}</span>
              <span>${stats.regionsCompleted}/35 ${t('regions')}</span>
            </div>
            <div class="progress-bar">
              <div class="fill" style="width: ${(stats.regionsCompleted / 35 * 100).toFixed(1)}%"></div>
            </div>
          </div>
        ` : `
          <div class="card animate-fade-in" style="animation-delay: 0.2s; margin-top: 1rem; text-align: center;">
            <i data-lucide="map" style="width: 3rem; height: 3rem; color: var(--text-secondary); margin-bottom: 0.5rem;"></i>
            <h3 style="margin: 1rem 0;">${t('stats_no_drawings')}</h3>
            <p style="color: var(--text-secondary);">${t('stats_go_to_levels')}</p>
            <button class="btn btn-primary" data-action="start" style="margin-top: 1rem; display: inline-flex; align-items: center; gap: 0.5rem;">${t('stats_start')} <i data-lucide="arrow-right"></i></button>
          </div>
        `}

        <div style="margin-top: 2rem; text-align: center;">
          <button class="btn btn-secondary" data-action="reset" style="font-size: 0.85rem; color: var(--danger); display: inline-flex; align-items: center; gap: 0.5rem;">
            <i data-lucide="trash-2" style="width: 16px; height: 16px;"></i> ${t('stats_reset_all')}
          </button>
        </div>
      </div>
    `;

    // Events
    el.querySelector('[data-action="back"]').addEventListener('click', () => {
      this.app.showHome();
    });

    const startBtn = el.querySelector('[data-action="start"]');
    if (startBtn) {
      startBtn.addEventListener('click', () => {
        this.app.showLevelSelect();
      });
    }

    el.querySelector('[data-action="reset"]').addEventListener('click', () => {
      if (confirm('Tüm ilerlemen silinecek. Emin misin?')) {
        this.app.gameState.resetAll();
        this.app.showHome();
      }
    });

    return el;
  }
}
