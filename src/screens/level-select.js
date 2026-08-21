import { levels, getRegionById } from '../data/levels.js';
import { t, getLanguage } from '../i18n.js';

/**
 * LevelSelectScreen - Level selection with lock/unlock states and progress
 */
export class LevelSelectScreen {
  constructor(app) {
    this.app = app;
    this.filterMode = null;
  }

  render(filterMode = null) {
    this.filterMode = filterMode;
    const el = document.createElement('div');
    el.className = 'screen ';
    el.id = 'level-select-screen';

    const filteredLevels = filterMode
      ? levels.filter(l => l.mode === filterMode)
      : levels;

    const title = filterMode === 'trace' ? t('levels_trace')
      : filterMode === 'blind' ? t('levels_blind')
      : t('levels_all');

    el.innerHTML = `
      <div class="screen-header">
        <button class="btn btn-icon" data-action="back"><i data-lucide="arrow-left"></i></button>
        <h1>${title}</h1>
        <div style="width:44px"></div>
      </div>
      <div class="scroll-container" id="levels-container"></div>
    `;

    const container = el.querySelector('#levels-container');

    for (const level of filteredLevels) {
      const isUnlocked = this.app.gameState.isLevelUnlocked(level.id);
      const section = document.createElement('div');

      // Section header
      const modeIcon = level.mode === 'trace' ? '<i data-lucide="pen-tool" style="display:inline-block; vertical-align:middle; width: 1.2rem; height: 1.2rem; margin-right: 0.2rem;"></i>' : '<i data-lucide="brain" style="display:inline-block; vertical-align:middle; width: 1.2rem; height: 1.2rem; margin-right: 0.2rem;"></i>';
      
      const lang = getLanguage();
      const sName = lang === 'en' && level.sectionNameEn ? level.sectionNameEn : level.sectionName;
      const sDesc = lang === 'en' && level.descriptionEn ? level.descriptionEn : level.description;

      section.innerHTML = `
        <h3 class="section-header" style="display:flex; align-items:center;">${modeIcon} ${sName}</h3>
        <p style="color: var(--text-secondary); font-size: 0.85rem; margin-bottom: 0.75rem;">
          ${sDesc}
          ${!isUnlocked ? `<br><i data-lucide="lock" style="width: 14px; height: 14px; vertical-align: middle;"></i> ${level.requiredStars} ${t('stars_required')}` : ''}
        </p>
      `;

      // Region cards grid
      const grid = document.createElement('div');
      grid.className = 'level-grid';

      for (const regionId of level.regions) {
        const region = getRegionById(regionId);
        if (!region) continue;

        const result = this.app.gameState.getRegionResult(regionId);
        const bestScore = result?.bestScore || 0;
        const card = document.createElement('div');
        card.className = `level-card${!isUnlocked ? ' locked' : ''}${bestScore >= 51 ? ' completed' : ''}`;

        const stars = bestScore >= 81 ? '⭐⭐⭐' : bestScore >= 51 ? '⭐⭐' : bestScore > 0 ? '⭐' : '☆☆☆';
        const rName = lang === 'en' && region.nameEn ? region.nameEn : region.name;

        card.innerHTML = `
          <h3 style="font-size: 1rem;">${rName}</h3>
          <div class="star-rating" style="margin: 0.25rem 0; font-size: 0.9rem;">${stars}</div>
          ${bestScore > 0 ? `<span class="badge" style="font-size: 0.65rem;">${bestScore}%</span>` : ''}
        `;

        if (isUnlocked) {
          card.addEventListener('click', () => {
            this.app.gameState.session.isDaily = false;
            this.app.startGame(regionId, level.mode);
          });
        }

        grid.appendChild(card);
      }

      section.appendChild(grid);
      container.appendChild(section);
    }

    // Back button
    el.querySelector('[data-action="back"]').addEventListener('click', () => {
      this.app.showHome();
    });

    return el;
  }
}
