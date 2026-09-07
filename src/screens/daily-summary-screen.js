import { t, getLanguage, localeUpperCase } from '../i18n.js';
import { getRegionById } from '../data/levels.js';
import { track } from '../engine/analytics.js';

/**
 * DailySummaryScreen — end-of-set recap for the Daily Triple (#17).
 * Rendered by ResultScreen once all 3 of today's daily regions are played.
 * Receives a plain summary object rather than reading session state:
 * `{ regionIds: [id,id,id], scores: {id: score}, total, streak }`.
 */
export class DailySummaryScreen {
  constructor(app) {
    this.app = app;
  }

  render(summary) {
    this.summary = summary;
    const el = document.createElement('div');
    el.className = 'screen scroll-container';
    el.id = 'daily-summary-screen';
    el.style.padding = '1rem';

    const lang = getLanguage();

    const regionRows = summary.regionIds.map((id, i) => {
      const region = getRegionById(id);
      const isEnglishName = lang === 'en' && !!region?.nameEn;
      const name = region ? localeUpperCase(isEnglishName ? region.nameEn : region.name, isEnglishName) : id;
      const score = summary.scores[id] ?? 0;
      return `
        <div style="display:flex; align-items:center; justify-content:space-between; padding: 0.6rem 0; ${i > 0 ? 'border-top: 1px solid var(--border-color);' : ''}">
          <span style="color: var(--text-primary); font-weight: 500;">${i + 1}. ${name}</span>
          <span style="color: var(--text-secondary); font-size: 0.9rem;"><strong style="color: var(--accent-primary);">${score}</strong>/100</span>
        </div>
      `;
    }).join('');

    el.innerHTML = `
      <div style="flex:1; display:flex; flex-direction:column; align-items:center; padding: 1rem;">
        <div class="animate-bounce-in" style="margin-bottom: 0.5rem;">
          <i data-lucide="calendar" style="width: 3.5rem; height: 3.5rem; color: var(--accent-primary);"></i>
        </div>
        <h1 class="logo" style="font-size: 1.75rem;">${t('daily_summary_title')}</h1>
        ${summary.streak >= 1 ? `
          <p class="subtitle" style="display: flex; align-items: center; gap: 0.35rem; color: var(--warning, #f39c12); font-weight: 600; margin-bottom: 0.5rem;">
            <i data-lucide="flame" style="width: 1.1rem; height: 1.1rem;"></i>${t('daily_streak', { count: summary.streak })}
          </p>
        ` : ''}

        <div class="card animate-pop-in" style="width: 100%; max-width: 420px; text-align: center; margin-top: 0.5rem;">
          <span style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 1px; color: var(--text-secondary); font-weight: 600;">${t('daily_summary_total')}</span>
          <div style="display: flex; align-items: baseline; justify-content: center; gap: 0.25rem;">
            <span style="font-size: 3rem; font-weight: 800; color: var(--accent-primary); line-height: 1.2;">${summary.total}</span>
            <span style="font-size: 1rem; color: var(--text-secondary); font-weight: 600;">/300</span>
          </div>
        </div>

        <div class="card" style="width: 100%; max-width: 420px; margin-top: 1rem; text-align: left;">
          ${regionRows}
        </div>

        <p style="color: var(--text-secondary); font-size: 0.85rem; margin-top: 1rem;">${t('daily_summary_tomorrow')}</p>

        <div style="display: flex; flex-direction: column; align-items: center; margin-top: 1.5rem; gap: 0.75rem; margin-bottom: 1rem;">
          <div style="display: flex; gap: 0.75rem; flex-wrap: wrap; justify-content: center;">
            <button class="btn btn-secondary" data-action="share" style="display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 1.5rem; border-radius: var(--radius-full); font-size: 0.85rem; font-weight: 500; border: none; background: var(--button-bg);">
              <i data-lucide="share-2" style="width: 16px; height: 16px;"></i> ${t('daily_summary_share')}
            </button>
            <button class="btn btn-secondary" data-action="menu" style="display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 1.5rem; border-radius: var(--radius-full); font-size: 0.85rem; font-weight: 500; border: none; background: var(--button-bg);">
              <i data-lucide="home" style="width: 16px; height: 16px;"></i> ${t('daily_summary_menu')}
            </button>
          </div>
        </div>
      </div>
    `;

    el.querySelector('[data-action="menu"]').addEventListener('click', () => {
      this.app.showHome();
    });

    el.querySelector('[data-action="share"]').addEventListener('click', () => this.share(summary));

    return el;
  }

  /**
   * Text-only share (no comparison canvases exist at this point) — Web
   * Share API with a clipboard-copy fallback, same pattern as the chain
   * summary's share.
   */
  async share(summary) {
    const shareText = t('share_text_daily_triple', { total: summary.total });
    const shareUrl = 'https://www.geodoodle.com/?daily=1&utm_source=share&utm_medium=social';

    if (navigator.share) {
      try {
        await navigator.share({ title: 'GeoDoodle', text: shareText, url: shareUrl });
        track('share', { method: 'native', daily: true });
      } catch (e) {
        // User cancelled the share sheet — not a real share, don't count it.
      }
      return;
    }

    try {
      await navigator.clipboard.writeText(`${shareText} ${shareUrl}`);
      this.app.showToast(t('daily_summary_copied'));
      track('share', { method: 'clipboard', daily: true });
    } catch (e) {
      // Clipboard access denied/unavailable — nothing more we can do.
    }
  }
}
