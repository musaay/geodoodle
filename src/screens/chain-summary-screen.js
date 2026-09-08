import { t, getLanguage, localeUpperCase } from '../i18n.js';
import { getRegionById } from '../data/levels.js';
import { track } from '../engine/analytics.js';
import * as portalSdk from '../engine/portal-sdk.js';

/**
 * ChainSummaryScreen — end-of-run recap for Neighbor Chain mode (#15).
 * Rendered by ResultScreen once a chain ends (score < 40, or the neighbor
 * resolver has nothing left). Receives a plain summary object rather than
 * reading session state, so it doesn't need the chain to still exist:
 * `{ links: [{region, score, value}], total, mode, isNewBestChain }`.
 */
export class ChainSummaryScreen {
  constructor(app) {
    this.app = app;
  }

  render(summary) {
    this.summary = summary;
    // #23: run completion is its own "achievement" moment, independent of
    // any single round's rank — called once per render (this screen is only
    // ever rendered when a chain actually ends).
    portalSdk.happytime();
    const el = document.createElement('div');
    el.className = 'screen scroll-container';
    el.id = 'chain-summary-screen';
    el.style.padding = '1rem';

    const lang = getLanguage();
    const bestChain = this.app.gameState.getBestChain();

    const linkRows = summary.links.map((link, i) => {
      const region = getRegionById(link.region);
      const isEnglishName = lang === 'en' && !!region?.nameEn;
      const name = region ? localeUpperCase(isEnglishName ? region.nameEn : region.name, isEnglishName) : link.region;
      return `
        <div style="display:flex; align-items:center; justify-content:space-between; padding: 0.6rem 0; ${i > 0 ? 'border-top: 1px solid var(--border-color);' : ''}">
          <span style="color: var(--text-primary); font-weight: 500;">${i + 1}. ${name}</span>
          <span style="color: var(--text-secondary); font-size: 0.9rem;">${link.score}/100 → <strong style="color: var(--accent-primary);">${link.value}</strong></span>
        </div>
      `;
    }).join('');

    el.innerHTML = `
      <div style="flex:1; display:flex; flex-direction:column; align-items:center; padding: 1rem;">
        <div class="animate-bounce-in" style="margin-bottom: 0.5rem;">
          <i data-lucide="route" style="width: 3.5rem; height: 3.5rem; color: var(--accent-primary);"></i>
        </div>
        <h1 class="logo" style="font-size: 1.75rem;">${t('chain_summary_title')}</h1>
        ${summary.isNewBestChain ? `<p class="subtitle" style="color: var(--warning, #f39c12); font-weight: 600; margin-bottom: 0.5rem;">${t('chain_summary_new_best')}</p>` : ''}

        <div class="card animate-pop-in" style="width: 100%; max-width: 420px; text-align: center; margin-top: 0.5rem;">
          <span style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 1px; color: var(--text-secondary); font-weight: 600;">${t('chain_summary_total')}</span>
          <div style="font-size: 3rem; font-weight: 800; color: var(--accent-primary); line-height: 1.2;">${summary.total}</div>
          <div style="color: var(--text-secondary); font-size: 0.9rem;">${t('chain_summary_links', { count: summary.links.length })}</div>
        </div>

        <div class="card" style="width: 100%; max-width: 420px; margin-top: 1rem; text-align: left;">
          ${linkRows}
        </div>

        ${bestChain && !summary.isNewBestChain ? `<p style="color: var(--text-secondary); font-size: 0.85rem; margin-top: 1rem;">${t('chain_summary_best_ever', { links: bestChain.links, total: bestChain.total })}</p>` : ''}

        <div style="display: flex; flex-direction: column; align-items: center; margin-top: 2rem; gap: 1rem; margin-bottom: 1rem;">
          <button class="btn btn-primary" data-action="play-again" style="display: flex; align-items: center; gap: 0.5rem; padding: 0.75rem 2rem; border-radius: var(--radius-full); font-size: 1rem; font-weight: 600; box-shadow: var(--shadow); border: none;">
            <i data-lucide="route" style="width: 20px; height: 20px;"></i> ${t('chain_summary_play_again')}
          </button>
          <div style="display: flex; gap: 0.75rem; flex-wrap: wrap; justify-content: center;">
            <button class="btn btn-secondary" data-action="share" style="display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 1.5rem; border-radius: var(--radius-full); font-size: 0.85rem; font-weight: 500; border: none; background: var(--button-bg);">
              <i data-lucide="share-2" style="width: 16px; height: 16px;"></i> ${t('chain_summary_share')}
            </button>
            <button class="btn btn-secondary" data-action="menu" style="display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 1.5rem; border-radius: var(--radius-full); font-size: 0.85rem; font-weight: 500; border: none; background: var(--button-bg);">
              <i data-lucide="home" style="width: 16px; height: 16px;"></i> ${t('chain_summary_menu')}
            </button>
          </div>
        </div>
      </div>
    `;

    el.querySelector('[data-action="play-again"]').addEventListener('click', () => {
      this.app.startChain(summary.mode);
    });

    el.querySelector('[data-action="menu"]').addEventListener('click', () => {
      this.app.showHome();
    });

    el.querySelector('[data-action="share"]').addEventListener('click', () => this.share(summary));

    return el;
  }

  /**
   * Text-only share (no comparison canvases exist at this point, unlike a
   * single-round result) — Web Share API with a clipboard-copy fallback.
   */
  async share(summary) {
    const shareText = t('share_text_chain', { links: summary.links.length, total: summary.total });
    const shareUrl = 'https://www.geodoodle.com/?utm_source=share&utm_medium=social';

    if (navigator.share) {
      try {
        await navigator.share({ title: 'GeoDoodle', text: shareText, url: shareUrl });
        track('share', { method: 'native', chain: true });
      } catch (e) {
        // User cancelled the share sheet — not a real share, don't count it.
      }
      return;
    }

    try {
      await navigator.clipboard.writeText(`${shareText} ${shareUrl}`);
      this.app.showToast(t('chain_summary_copied'));
      track('share', { method: 'clipboard', chain: true });
    } catch (e) {
      // Clipboard access denied/unavailable — nothing more we can do.
    }
  }
}
