import { t, getLanguage } from '../i18n.js';

export class ResultScreen {
  constructor(app) {
    this.app = app;
  }

  render(region, result, mode, isNewBest) {
    const { score, rank, visualData } = result;
    const theme = this.app.gameState.getTheme();
    const el = document.createElement('div');
    el.className = 'screen scroll-container';
    el.id = 'result-screen';
    
    el.style.padding = '0.5rem';
    el.style.display = 'flex';
    el.style.flexDirection = 'column';

    const session = this.app.gameState.session;
    const isMultiplayer = session.playerCount === 2;
    this.renderedCanvases = [];

    const p1Score = isMultiplayer ? session.p1Score : score;
    const p2Score = isMultiplayer ? session.p2Score : 0;
    
    const p1Visual = isMultiplayer ? session.p1VisualData : visualData;
    const p2Visual = isMultiplayer ? visualData : null;

    const modeText = mode === 'blind' ? t('mode_text_blind') : t('mode_text_trace');
    const lang = getLanguage();
    const rName = lang === 'en' && region.nameEn ? region.nameEn : region.name;
    const regionName = rName.toUpperCase();

    const renderPlayerHtml = (num, pScore, isWinner, isTie, vData) => {
      // Ensure the text wrapper is exactly the same width as the canvas
      const widthStr = vData ? `max-width: ${vData.canvasWidth}px;` : 'width: 100%;';
      return `
      <div style="display: flex; flex-direction: column; width: 100%; ${widthStr} margin: 0 auto;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; text-transform: uppercase; font-size: 0.9rem; font-weight: bold; letter-spacing: 1px; height: 1.5rem;">
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <button style="visibility: hidden; font-size: 1.2rem; padding: 0; min-height: 0; min-width: 0; line-height: 1; border: none; background: transparent;"><i data-lucide="arrow-left"></i></button>
            <span style="color: var(--text-primary); line-height: 1;">${regionName}${isMultiplayer ? ` (${t('player')}${num})` : ''}</span>
          </div>
          <div style="display: flex; align-items: center; gap: 1rem;">
            <span style="color: var(--text-secondary); line-height: 1;">${isMultiplayer ? (isWinner ? t('result_winner') : isTie ? t('result_tie') : t('result_nice_try')) : modeText}</span>
          </div>
        </div>
        <div id="p${num}-canvas-container" style="width: 100%; margin: 1rem auto; background: var(--button-bg); border-radius: var(--radius-md); padding: 1rem; border: 1px solid var(--border-color);"></div>
        <div style="display: flex; gap: 1rem; margin-top: 1rem;">
          <div style="flex:1; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1rem; display: flex; flex-direction: column; align-items: center; justify-content: center; box-shadow: var(--shadow);">
            <span style="font-size: 0.7rem; text-transform: uppercase; color: var(--text-secondary); letter-spacing: 1px; font-weight: 600; margin-bottom: 0.25rem;">${t('result_score')}</span>
            <div style="display: flex; align-items: baseline; gap: 0.25rem;">
              <span style="font-size: 2rem; font-weight: 700; color: var(--accent-primary); line-height: 1;">${pScore}</span>
              <span style="font-size: 0.85rem; color: var(--text-secondary); font-weight: 600;">/ 100</span>
            </div>
          </div>
          <div style="flex:1; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1rem; display: flex; flex-direction: column; align-items: center; justify-content: center; box-shadow: var(--shadow);">
            <span style="font-size: 0.7rem; text-transform: uppercase; color: var(--text-secondary); letter-spacing: 1px; font-weight: 600; margin-bottom: 0.25rem;">${t('result_avg_dev')}</span>
            <span style="font-size: 2rem; font-weight: 700; color: var(--accent-primary); line-height: 1;">${vData?.avgDeviationPercent ?? 0}%</span>
          </div>
        </div>
        ${num === 1 ? `
        <div style="display: flex; justify-content: center; flex-wrap: wrap; gap: 0.75rem; margin-top: 1.5rem; font-size: 0.75rem; color: var(--text-primary); font-weight: 500;">
          <div style="display: flex; align-items: center; gap: 0.4rem; background: var(--button-bg); padding: 0.4rem 0.75rem; border-radius: var(--radius-full); border: 1px solid var(--border-color);">
            <svg width="14" height="14" viewBox="0 0 16 16"><path d="M8 2l6 3v6l-6 3-6-3V5l6-3z" fill="none" stroke="currentColor" stroke-dasharray="2,2"/></svg>
            ${t('result_ref')}
          </div>
          <div style="display: flex; align-items: center; gap: 0.4rem; background: var(--button-bg); padding: 0.4rem 0.75rem; border-radius: var(--radius-full); border: 1px solid var(--border-color);">
            <div style="width: 6px; height: 6px; border-radius: 50%; background: var(--text-primary);"></div>
            ${t('result_pts')}
          </div>
          <div style="display: flex; align-items: center; gap: 0.4rem; background: var(--button-bg); padding: 0.4rem 0.75rem; border-radius: var(--radius-full); border: 1px solid var(--border-color);">
            <div style="width: 12px; height: 3px; border-radius: 2px; background: var(--success);"></div>
            ${t('result_in')}
          </div>
          <div style="display: flex; align-items: center; gap: 0.4rem; background: var(--button-bg); padding: 0.4rem 0.75rem; border-radius: var(--radius-full); border: 1px solid var(--border-color);">
            <div style="width: 12px; height: 3px; border-radius: 2px; background: var(--danger);"></div>
            ${t('result_out')}
          </div>
        </div>
        ` : ''}
      </div>
      `;
    };

    el.innerHTML = `
      <div style="display: flex; flex-direction: ${isMultiplayer ? 'row' : 'column'}; gap: 2rem; width: 100%;">
        ${renderPlayerHtml(1, p1Score, isMultiplayer && p1Score > p2Score, isMultiplayer && p1Score === p2Score, p1Visual)}
        ${isMultiplayer ? renderPlayerHtml(2, p2Score, p2Score > p1Score, p1Score === p2Score, p2Visual) : ''}
      </div>

      <div style="display: flex; flex-direction: column; align-items: center; margin-top: 2rem; gap: 1rem; margin-bottom: 2rem;">
        <button class="btn btn-primary" data-action="retry" style="display: flex; align-items: center; gap: 0.5rem; padding: 0.75rem 2rem; border-radius: var(--radius-full); font-size: 1rem; font-weight: 600; box-shadow: var(--shadow); border: none;">
          <i data-lucide="rotate-ccw" style="width: 20px; height: 20px;"></i> ${t('play_again')}
        </button>
        <div style="display: flex; gap: 0.75rem;">
          <button class="btn btn-secondary" data-action="share" style="display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 1.5rem; border-radius: var(--radius-full); font-size: 0.85rem; font-weight: 500; border: none; background: var(--button-bg);">
            <i data-lucide="share-2" style="width: 16px; height: 16px;"></i> ${t('result_share')}
          </button>
          <button class="btn btn-secondary" data-action="next" style="display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 1.5rem; border-radius: var(--radius-full); font-size: 0.85rem; font-weight: 500; border: none; background: var(--button-bg);">
            <i data-lucide="home" style="width: 16px; height: 16px;"></i> ${t('back_to_menu')}
          </button>
        </div>
      </div>
    `;

    requestAnimationFrame(() => {
      const p1Container = el.querySelector('#p1-canvas-container');
      if (p1Container && p1Visual) {
        this.renderComparisonCanvas(p1Container, p1Visual, theme);
      }
      
      const p2Container = el.querySelector('#p2-canvas-container');
      if (p2Container && p2Visual) {
        this.renderComparisonCanvas(p2Container, p2Visual, theme);
      }
    });

    el.querySelector('[data-action="retry"]').addEventListener('click', () => {
      this.app.gameState.session.currentPlayer = 1;
      this.app.startGame(region.id, mode);
    });

    el.querySelector('[data-action="next"]').addEventListener('click', () => {
      this.app.gameState.session.currentPlayer = 1;
      this.app.showHome();
    });

    el.querySelector('[data-action="share"]').addEventListener('click', () => {
      const scoresText = isMultiplayer
        ? `${t('player')}1: ${p1Score} • ${t('player')}2: ${p2Score}`
        : `${score}/100`;
      this.shareResult(regionName, scoresText);
    });

    return el;
  }

  /** Compose the comparison canvas(es) into a PNG and share/download it */
  async shareResult(regionName, scoresText) {
    const canvases = this.renderedCanvases.filter(Boolean);
    if (canvases.length === 0) return;

    const pad = 24;
    const titleH = 48;
    const night = this.app.gameState.getTheme() === 'night';

    const out = document.createElement('canvas');
    out.width = canvases.reduce((sum, c) => sum + c.width, 0) + pad * (canvases.length + 1);
    out.height = Math.max(...canvases.map(c => c.height)) + titleH + pad * 2;
    const ctx = out.getContext('2d');

    ctx.fillStyle = night ? '#18181B' : '#F9F8F6';
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.fillStyle = night ? '#ffffff' : '#1a1a1a';
    ctx.font = '600 22px Outfit, system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillText(`GeoDoodle • ${regionName} • ${scoresText}`, pad, pad + titleH / 2);

    let x = pad;
    for (const c of canvases) {
      ctx.drawImage(c, x, titleH + pad);
      x += c.width + pad;
    }

    const blob = await new Promise(resolve => out.toBlob(resolve, 'image/png'));
    if (!blob) return;

    const file = new File([blob], 'geodoodle.png', { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'GeoDoodle' });
      } catch (e) {
        // User cancelled the share sheet — nothing to do
      }
      return;
    }

    // Fallback: plain download
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'geodoodle.png';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  renderComparisonCanvas(container, visualData, theme) {
    if (!visualData) return;
    const displayCanvas = document.createElement('canvas');
    
    // Use exact original drawing canvas width to ensure 1:1 sizing
    const maxWidth = visualData.canvasWidth;
    
    const aspect = visualData.canvasHeight / visualData.canvasWidth;
    displayCanvas.width = maxWidth;
    displayCanvas.height = maxWidth * aspect;
    displayCanvas.style.width = maxWidth + 'px';
    displayCanvas.style.maxWidth = '100%';
    displayCanvas.style.height = 'auto';
    
    // Minimalist styling
    displayCanvas.style.border = '2px solid var(--border-color)';
    displayCanvas.style.background = 'transparent';

    const ctx = displayCanvas.getContext('2d');
    const scaleX = maxWidth / visualData.canvasWidth;
    const scaleY = (maxWidth * aspect) / visualData.canvasHeight;
    
    ctx.scale(scaleX, scaleY);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    const { targetPoly, userPoly, rays } = visualData;

    // 1. Draw Target Polygon (Reference) - Very light gray dashed
    ctx.beginPath();
    ctx.strokeStyle = theme === 'night' ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)';
    ctx.lineWidth = 1.5;
    if (targetPoly.length > 0) {
      ctx.moveTo(targetPoly[0].x, targetPoly[0].y);
      for(let i=1; i<targetPoly.length; i++) ctx.lineTo(targetPoly[i].x, targetPoly[i].y);
      ctx.closePath();
      ctx.stroke();
    }

    // 2. Draw Rays (Deviation)
    ctx.lineWidth = 1;
    const colorInside = theme === 'night' ? '#00f5d4' : '#4d94ff';
    const colorOutside = theme === 'night' ? '#ff3b30' : '#ff4d4d';
    
    for (const ray of rays) {
      ctx.beginPath();
      ctx.strokeStyle = ray.isInside ? colorInside : colorOutside;
      ctx.moveTo(ray.from.x, ray.from.y);
      ctx.lineTo(ray.to.x, ray.to.y);
      ctx.stroke();
    }

    // 3. Draw User Polygon (Points + Lines)
    ctx.beginPath();
    ctx.strokeStyle = theme === 'night' ? '#ffffff' : '#000000';
    ctx.lineWidth = 2;
    if (userPoly.length > 0) {
      ctx.moveTo(userPoly[0].x, userPoly[0].y);
      for(let i=1; i<userPoly.length; i++) ctx.lineTo(userPoly[i].x, userPoly[i].y);
      ctx.closePath();
      ctx.stroke();
    }

    // Dots for User Polygon
    for (let i = 0; i < rays.length; i++) {
      const pt = rays[i].from;
      
      ctx.fillStyle = theme === 'night' ? '#ffffff' : '#000000';
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 2.5, 0, Math.PI*2);
      ctx.fill();
    }
    
    container.appendChild(displayCanvas);
    this.renderedCanvases.push(displayCanvas);
  }
}
