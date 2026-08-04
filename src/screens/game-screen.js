import { getRegionById } from '../data/levels.js';
import { t, getLanguage } from '../i18n.js';
import { CanvasManager } from '../engine/canvas-manager.js';
import { DrawingEngine } from '../engine/drawing-engine.js';
import { ComparisonEngine } from '../engine/comparison-engine.js';

/**
 * GameScreen - Main drawing gameplay screen
 * Supports trace mode (with silhouette) and blind mode (from memory)
 */
export class GameScreen {
  constructor(app) {
    this.app = app;
    this.canvasManager = null;
    this.drawingEngine = null;
    this.region = null;
    this.mode = 'trace';
    this.hintActive = false;
    this.hintTimer = null;
  }

  render(regionId, mode) {
    this.region = getRegionById(regionId);
    this.mode = mode;
    if (!this.region) return document.createElement('div');

    const theme = this.app.gameState.getTheme();
    const el = document.createElement('div');
    el.className = 'screen';
    el.id = 'game-screen';
    el.style.padding = '0.5rem';

    const modeText = mode === 'blind' ? t('mode_text_blind') : t('mode_text_trace');
    const lang = getLanguage();
    const rName = lang === 'en' && this.region.nameEn ? this.region.nameEn : this.region.name;
    const regionName = rName.toUpperCase();
    const hints = 3; // TODO: Get from game state if needed

    el.innerHTML = `
      <div style="position: relative; width: 100%; max-width: 100vw; margin: 0 auto; display: flex; flex-direction: column;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; text-transform: uppercase; font-size: 0.9rem; font-weight: bold; letter-spacing: 1px; height: 1.5rem;">
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <button class="btn btn-icon" data-action="back" style="font-size: 1.2rem; padding: 0; min-height: 0; min-width: 0; line-height: 1; border: none; background: transparent; color: var(--text-secondary);"><i data-lucide="arrow-left"></i></button>
            <span style="color: var(--text-primary); line-height: 1;">${regionName}</span>
          </div>
          <div style="display: flex; align-items: center; gap: 1rem;">
            ${mode === 'blind' ? `
              <div class="timer-ring-container" style="display:flex; align-items:center; position: relative;">
                <svg class="timer-ring-svg" viewBox="0 0 40 40" style="width: 24px; height: 24px; transform: rotate(-90deg);">
                  <circle cx="20" cy="20" r="16" fill="none" stroke="var(--border-color)" stroke-width="4"></circle>
                  <circle id="timer-ring-fg" cx="20" cy="20" r="16" fill="none" stroke="var(--text-primary)" stroke-width="4" stroke-dasharray="100" stroke-dashoffset="0" style="transition: stroke-dashoffset 1s linear;"></circle>
                </svg>
                <span id="timer-num" style="position:absolute; width: 100%; text-align: center; font-weight:bold; font-size: 0.6rem; line-height: 1;">10</span>
              </div>
              <button class="btn btn-icon animate-breathe" data-action="hint" title="${t('hint_title', {count: hints})}" style="font-size: 1rem; padding: 0; min-height: 0; min-width: 0; line-height: 1; border: none; background: transparent; display: flex; align-items: center;"><i data-lucide="lightbulb" style="color: var(--warning, #f39c12); width: 20px; height: 20px;"></i></button>
            ` : ''}
            <span style="color: var(--text-secondary); line-height: 1;">${modeText}</span>
          </div>
        </div>
      </div>
      <div class="canvas-container" id="drawing-canvas"></div>
      <div class="toolbar">
        <button class="toolbar-btn" data-action="brush-thin" title="${t('tool_thin_title')}">
          <i data-lucide="pen-tool"></i>
          <span>${t('tool_thin')}</span>
        </button>
        <button class="toolbar-btn active" data-action="brush-medium" title="${t('tool_medium_title')}">
          <i data-lucide="pen"></i>
          <span>${t('tool_medium')}</span>
        </button>
        <button class="toolbar-btn" data-action="brush-thick" title="${t('tool_thick_title')}">
          <i data-lucide="paintbrush"></i>
          <span>${t('tool_thick')}</span>
        </button>
        <button class="toolbar-btn" data-action="eraser" title="${t('tool_eraser_title')}">
          <i data-lucide="eraser"></i>
          <span>${t('tool_eraser')}</span>
        </button>
        <button class="toolbar-btn" data-action="undo" title="${t('tool_undo_title')}">
          <i data-lucide="undo-2"></i>
          <span>${t('tool_undo')}</span>
        </button>
        <button class="toolbar-btn" data-action="clear" title="${t('tool_clear_title')}">
          <i data-lucide="trash-2"></i>
          <span>${t('tool_clear')}</span>
        </button>
        <button class="toolbar-btn" data-action="submit" style="color: var(--success); font-weight: bold;" title="${t('tool_submit_title')}">
          <i data-lucide="check-circle-2"></i>
          <span>${t('tool_submit')}</span>
        </button>
      </div>
    `;

    // Initialize after DOM insertion
    requestAnimationFrame(() => {
      this.initCanvas(el, theme);
    });

    // Event listeners
    this.setupEvents(el);

    return el;
  }

  initCanvas(el, theme) {
    const container = el.querySelector('#drawing-canvas');
    if (!container) return;

    this.canvasManager = new CanvasManager(container);
    this.drawingEngine = new DrawingEngine(this.canvasManager, {
      theme,
      color: theme === 'night' ? '#00f5d4' : '#3d2b1f',
      lineWidth: 3,
    });

    // In trace mode, show the silhouette as background
    if (this.mode === 'trace') {
      this.drawingEngine.setExtraRender(() => {
        this.canvasManager.renderRegionOutline(this.region.path, {
          color: theme === 'night' ? 'rgba(0,245,212,0.2)' : 'rgba(92,64,51,0.15)',
          lineWidth: 3,
          lineDash: [8, 6],
          opacity: 0.6,
          fill: true,
          fillColor: theme === 'night' ? 'rgba(0,245,212,0.05)' : 'rgba(200,169,81,0.08)',
        });
      });
    } else {
      // Blind mode 5% hint
      this.drawingEngine.setExtraRender(() => {
        this.canvasManager.renderRegionOutline(this.region.path, {
          hintPercent: 0.05,
          color: theme === 'night' ? 'rgba(255,215,0,0.6)' : 'rgba(218,165,32,0.6)', // Golden/Brass
          lineWidth: 4,
          lineDash: [4, 4]
        });
      });
      
      // Start 10 second timer
      this.startTimer(el);
    }

    this.drawingEngine.enable();
    this.drawingEngine.render();
  }

  startTimer(el) {
    let timeLeft = 10;
    const ringFg = el.querySelector('#timer-ring-fg');
    const numEl = el.querySelector('#timer-num');
    if (!ringFg || !numEl) return;
    
    // Total dash array length is 2*pi*r = ~100
    if (this.gameTimer) clearInterval(this.gameTimer);
    
    this.gameTimer = setInterval(() => {
      timeLeft--;
      numEl.textContent = timeLeft;
      
      const offset = 100 - (timeLeft / 10) * 100;
      ringFg.style.strokeDashoffset = offset;
      
      if (timeLeft <= 3) {
        ringFg.style.stroke = 'var(--danger, #e74c3c)';
        numEl.style.color = 'var(--danger, #e74c3c)';
      }
      
      if (timeLeft <= 0) {
        clearInterval(this.gameTimer);
        this.submitDrawing();
      }
    }, 1000);
  }

  setupEvents(el) {
    // Back
    el.querySelector('[data-action="back"]').addEventListener('click', () => {
      this.cleanup();
      this.app.showLevelSelect();
    });

    // Brush sizes
    const brushActions = {
      'brush-thin': 2,
      'brush-medium': 3,
      'brush-thick': 6,
    };

    for (const [action, size] of Object.entries(brushActions)) {
      el.querySelector(`[data-action="${action}"]`).addEventListener('click', (e) => {
        if (!this.drawingEngine) return;
        this.drawingEngine.setBrushSize(size);
        this.drawingEngine.setEraser(false);
        el.querySelectorAll('.toolbar-btn').forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
      });
    }

    // Eraser
    el.querySelector('[data-action="eraser"]').addEventListener('click', (e) => {
      if (!this.drawingEngine) return;
      this.drawingEngine.setEraser(true);
      el.querySelectorAll('.toolbar-btn').forEach(b => b.classList.remove('active'));
      e.currentTarget.classList.add('active');
    });

    // Undo
    el.querySelector('[data-action="undo"]').addEventListener('click', () => {
      this.drawingEngine?.undo();
    });

    // Clear
    el.querySelector('[data-action="clear"]').addEventListener('click', () => {
      this.drawingEngine?.clearAll();
    });

    // Submit
    el.querySelector('[data-action="submit"]').addEventListener('click', () => {
      this.submitDrawing();
    });

    // Hint (blind mode only)
    const hintBtn = el.querySelector('[data-action="hint"]');
    if (hintBtn) {
      hintBtn.addEventListener('click', () => {
        this.showHint();
      });
    }
  }

  showHint() {
    if (this.hintActive || !this.drawingEngine) return;
    if (!this.app.gameState.useHint()) {
      this.app.showToast('İpucu hakkın kalmadı!');
      return;
    }

    this.hintActive = true;
    const theme = this.app.gameState.getTheme();

    // Temporarily show region outline
    const originalExtra = this.drawingEngine.extraRenderFn;
    this.drawingEngine.setExtraRender(() => {
      if (originalExtra) originalExtra();
      this.canvasManager.renderRegionOutline(this.region.path, {
        color: theme === 'night' ? 'rgba(0,245,212,0.3)' : 'rgba(139,26,26,0.2)',
        lineWidth: 2,
        lineDash: [4, 4],
        opacity: 0.5,
        fill: true,
        fillColor: theme === 'night' ? 'rgba(0,245,212,0.05)' : 'rgba(200,169,81,0.05)',
      });
    });
    this.drawingEngine.render();

    // Remove hint after 5 seconds
    this.hintTimer = setTimeout(() => {
      this.drawingEngine.setExtraRender(originalExtra);
      this.drawingEngine.render();
      this.hintActive = false;
    }, 5000);

    this.app.showToast(`İpucu: 5 saniye! (${this.app.gameState.getHintsRemaining()} kaldı)`);
  }

  submitDrawing() {
    if (!this.drawingEngine || !this.drawingEngine.hasDrawing()) {
      // In blind mode with timer running out, user might have drawn nothing.
      // We can just give them a 0 score instead of blocking.
      if (this.gameTimer) {
        // They ran out of time
      } else {
        this.app.showToast('Önce bir çizim yapmalısın!');
        return;
      }
    }

    const comparison = new ComparisonEngine();
    let result = { score: 0, rank: { name: 'Çırak' } };
    
    if (this.drawingEngine && this.drawingEngine.hasDrawing()) {
      result = comparison.compare(
        this.canvasManager,
        this.drawingEngine,
        this.region.path
      );
    }

    const session = this.app.gameState.session;
    
    // Save to permanent stats ONLY if single player
    let isNewBest = false;
    if (session.playerCount === 1) {
      isNewBest = this.app.gameState.completeRegion(
        this.region.id,
        result.score,
        result.rank
      );
    }

    this.cleanup();

    if (session.playerCount === 2) {
      if (session.currentPlayer === 1) {
        // Player 1 finished
        session.p1Score = result.score;
        session.p1VisualData = result.visualData;
        session.currentRegionId = this.region.id;
        session.currentMode = this.mode;
        
        // Go to handoff
        this.app.showHandoff();
      } else {
        // Player 2 finished
        session.p2Score = result.score;
        this.app.showResult(this.region, result, this.mode, isNewBest);
      }
    } else {
      this.app.showResult(this.region, result, this.mode, isNewBest);
    }
  }

  cleanup() {
    if (this.gameTimer) {
      clearInterval(this.gameTimer);
      this.gameTimer = null;
    }
    if (this.hintTimer) clearTimeout(this.hintTimer);
    this.drawingEngine?.destroy();
    this.canvasManager?.destroy();
    this.drawingEngine = null;
    this.canvasManager = null;
  }
}
