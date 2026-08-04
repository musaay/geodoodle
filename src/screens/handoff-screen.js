import { t } from '../i18n.js';

export class HandoffScreen {
  constructor(app) {
    this.app = app;
  }

  render() {
    const el = document.createElement('div');
    el.className = 'screen ';
    el.id = 'handoff-screen';

    el.innerHTML = `
      <div style="flex:1; display:flex; flex-direction:column; justify-content:center; align-items:center; padding: 2rem 1rem;">
        <div class="animate-bounce-in" style="margin-bottom: 0.5rem;">
          <span style="font-size: 4rem;">🤝</span>
        </div>
        <h1 class="logo">${t('handoff_title')}</h1>
        <p class="subtitle">${t('handoff_subtitle')}</p>
        
        <div class="card" style="padding: 1.5rem; text-align: center; max-width: 300px; margin-bottom: 2rem;">
          <p style="color: var(--text-muted); margin-bottom: 1rem;">${t('handoff_instruction')}</p>
          <button class="btn btn-primary btn-lg" id="btn-p2-start" style="width: 100%;">
            ▶️ ${t('handoff_ready')}
          </button>
        </div>
      </div>
    `;

    el.querySelector('#btn-p2-start').addEventListener('click', () => {
      this.app.gameState.session.currentPlayer = 2;
      this.app.startGame(this.app.gameState.session.currentRegionId, this.app.gameState.session.currentMode);
    });

    return el;
  }
}
