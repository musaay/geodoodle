import { t, getLanguage, localeUpperCase } from '../i18n.js';
import { getRank, getRegionById } from '../data/levels.js';
import { getDailyRegionPool, getDailyRegionIds, getDailyProgress, todayStr } from '../engine/daily.js';
import { track } from '../engine/analytics.js';
import * as portalSdk from '../engine/portal-sdk.js';

/**
 * RunSummaryScreen — end-of-run recap for Sefer/Run mode (#30). Rendered
 * by ResultScreen once the 5th region's result is committed. Receives a
 * plain summary object (GameState.completeRun()'s return value) rather
 * than reading state, so it doesn't need the run to still exist:
 * `{ regionIds, scores, mode, total, durationS, isNewBest, bestRun }`.
 *
 * Rank shown is the rank of the run's AVERAGE score (total / region
 * count) — getRank() is calibrated 0-100 per region; applying it to the
 * raw 0-500 run total directly would put nearly every run at the top
 * rank, defeating the point of showing one at all.
 *
 * This is the screen a player sees right before deciding whether to play
 * again, so "Yeni Sefer" is the primary action here the same way NEXT is
 * on a normal result screen — not a smaller peer to Menu/Daily.
 */
export class RunSummaryScreen {
  constructor(app) {
    this.app = app;
  }

  render(summary) {
    this.summary = summary;
    // #23: run completion is its own "achievement" moment, independent of
    // any single region's rank — called once per render (this screen is
    // only ever rendered when a run actually completes).
    portalSdk.happytime();
    const el = document.createElement('div');
    el.className = 'screen scroll-container';
    el.id = 'run-summary-screen';
    el.style.padding = '1rem';

    const lang = getLanguage();
    const { regionIds, scores, total, isNewBest, bestRun } = summary;
    const average = Math.round(total / (regionIds.length || 1));
    const rank = getRank(average);
    const rankName = lang === 'en' ? rank.nameEn : rank.name;

    const regionRows = regionIds.map((id, i) => {
      const region = getRegionById(id);
      const isEnglishName = lang === 'en' && !!region?.nameEn;
      const name = region ? localeUpperCase(isEnglishName ? region.nameEn : region.name, isEnglishName) : id;
      const score = scores[i] ?? 0;
      return `
        <div style="display:flex; align-items:center; justify-content:space-between; padding: 0.6rem 0; ${i > 0 ? 'border-top: 1px solid var(--border-color);' : ''}">
          <span style="color: var(--text-primary); font-weight: 500;">${i + 1}. ${name}</span>
          <span style="color: var(--text-secondary); font-size: 0.9rem;">${score}/100</span>
        </div>
      `;
    }).join('');

    // Today's Daily Triple progress, for the secondary button's label —
    // same pattern as the home screen's own daily card.
    const dateStr = todayStr();
    const dailyRegionIds = getDailyRegionIds(dateStr, getDailyRegionPool(), 3);
    const dailyEntry = this.app.gameState.getDailyEntry(dateStr);
    const dailyProgress = getDailyProgress(dailyEntry, dailyRegionIds);

    el.innerHTML = `
      <div style="flex:1; display:flex; flex-direction:column; align-items:center; padding: 1rem;">
        <div class="animate-bounce-in" style="margin-bottom: 0.5rem;">
          <i data-lucide="flag" style="width: 3.5rem; height: 3.5rem; color: var(--accent-primary);"></i>
        </div>
        <h1 class="logo" style="font-size: 1.75rem;">${t('run_summary_title')}</h1>
        ${isNewBest ? `<p class="subtitle" style="color: var(--warning, #f39c12); font-weight: 600; margin-bottom: 0.5rem;">${t('run_summary_new_best')}</p>` : ''}

        <div class="card animate-pop-in" style="width: 100%; max-width: 420px; text-align: center; margin-top: 0.5rem;">
          <span style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 1px; color: var(--text-secondary); font-weight: 600;">${t('run_summary_total')}</span>
          <div style="font-size: 3rem; font-weight: 800; color: var(--accent-primary); line-height: 1.2;">${total}</div>
          <div style="color: var(--text-secondary); font-size: 0.85rem; margin-top: 0.1rem;">${t('run_summary_average', { avg: average })}</div>
          <div class="result-rank-badge" style="display: inline-flex; margin-top: 0.5rem;">${rank.badge} ${rankName}</div>
        </div>

        <div class="card" style="width: 100%; max-width: 420px; margin-top: 1rem; text-align: left;">
          ${regionRows}
        </div>

        ${bestRun && !isNewBest ? `<p style="color: var(--text-secondary); font-size: 0.85rem; margin-top: 1rem;">${t('run_summary_best_ever', { total: bestRun.total })}</p>` : ''}

        <div style="display: flex; flex-direction: column; align-items: center; margin-top: 2rem; gap: 1rem; margin-bottom: 1rem;">
          <button class="btn btn-primary" data-action="new-run" style="display: flex; align-items: center; gap: 0.5rem; padding: 0.75rem 2rem; border-radius: var(--radius-full); font-size: 1rem; font-weight: 600; box-shadow: var(--shadow); border: none;">
            <i data-lucide="flag" style="width: 20px; height: 20px;"></i> ${t('run_summary_new_run')}
          </button>
          <div style="display: flex; gap: 0.75rem; flex-wrap: wrap; justify-content: center;">
            <button class="btn btn-secondary" data-action="daily" style="display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 1.5rem; border-radius: var(--radius-full); font-size: 0.85rem; font-weight: 500; border: none; background: var(--button-bg);">
              <i data-lucide="calendar" style="width: 16px; height: 16px;"></i> ${t('run_summary_daily')}
            </button>
            <button class="btn btn-secondary" data-action="menu" style="display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 1.5rem; border-radius: var(--radius-full); font-size: 0.85rem; font-weight: 500; border: none; background: var(--button-bg);">
              <i data-lucide="home" style="width: 16px; height: 16px;"></i> ${t('run_summary_menu')}
            </button>
          </div>
        </div>
      </div>
    `;

    el.querySelector('[data-action="new-run"]').addEventListener('click', () => {
      this.app.startRun(summary.mode);
    });

    el.querySelector('[data-action="daily"]').addEventListener('click', () => {
      track('daily_open', { progress: `${dailyProgress.playedCount}/3`, from: 'run_summary' });
      if (dailyProgress.isComplete) {
        this.app.showDailySummary({
          regionIds: dailyRegionIds,
          scores: this.app.gameState.getDailyEntry(dateStr)?.scores || {},
          total: dailyProgress.total,
          streak: this.app.gameState.getDailyStreak(),
        });
        return;
      }
      this.app.enterDaily(dailyProgress.nextRegionId);
    });

    el.querySelector('[data-action="menu"]').addEventListener('click', () => {
      this.app.showHome();
    });

    return el;
  }
}
