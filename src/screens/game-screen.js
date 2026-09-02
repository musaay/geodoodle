import { getRegionById } from '../data/levels.js';
import { t, getLanguage, localeUpperCase } from '../i18n.js';
import { CanvasManager } from '../engine/canvas-manager.js';
import { DrawingEngine } from '../engine/drawing-engine.js';
import { ComparisonEngine } from '../engine/comparison-engine.js';
import { playClick, playSubmit, playHint } from '../engine/audio-engine.js';

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
    this.hintsRemaining = 3;
    this.pendingTimerEl = null;
  }

  render(regionId, mode) {
    this.region = getRegionById(regionId);
    this.mode = mode;
    if (!this.region) return document.createElement('div');

    // Fresh hint allowance for every game (screen instances are reused)
    this.hintsRemaining = 3;
    this.hintActive = false;
    this.pendingTimerEl = null;

    const theme = this.app.gameState.getTheme();
    const el = document.createElement('div');
    el.className = 'screen';
    el.id = 'game-screen';
    el.style.padding = '0.5rem';

    const modeText = this.app.gameState.session.isDaily
      ? t('mode_text_daily')
      : mode === 'blind' ? t('mode_text_blind') : t('mode_text_trace');
    const lang = getLanguage();
    const isEnglishName = lang === 'en' && !!this.region.nameEn;
    const rName = isEnglishName ? this.region.nameEn : this.region.name;
    const regionName = localeUpperCase(rName, isEnglishName);

    el.innerHTML = `
      <div style="position: relative; width: 100%; max-width: 100vw; margin: 0 auto; display: flex; flex-direction: column;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; text-transform: uppercase; font-size: 0.9rem; font-weight: bold; letter-spacing: 1px; height: 1.5rem;">
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <button class="btn btn-icon" data-action="back" style="font-size: 1.2rem; padding: 0; min-height: 0; min-width: 0; line-height: 1; border: none; background: transparent; color: var(--text-secondary);"><i data-lucide="arrow-left"></i></button>
            <span id="region-name" style="color: var(--text-primary); line-height: 1;">${regionName}</span>
          </div>
          <div style="display: flex; align-items: center; gap: 1rem;">
            ${mode === 'blind' ? `
              <div class="timer-ring-container" style="display:flex; align-items:center; position: relative;">
                <svg class="timer-ring-svg" viewBox="0 0 40 40" style="width: 24px; height: 24px; transform: rotate(-90deg);">
                  <circle cx="20" cy="20" r="16" fill="none" stroke="var(--border-color)" stroke-width="4"></circle>
                  <circle id="timer-ring-fg" cx="20" cy="20" r="16" fill="none" stroke="var(--text-primary)" stroke-width="4" stroke-dasharray="100" stroke-dashoffset="0" style="transition: stroke-dashoffset 1s linear;"></circle>
                </svg>
                <span id="timer-num" style="position:absolute; width: 100%; text-align: center; font-weight:bold; font-size: 0.6rem; line-height: 1;">20</span>
              </div>
              <button class="btn btn-icon animate-breathe" id="btn-hint" data-action="hint" title="${t('hint_title', {count: this.hintsRemaining})}" style="font-size: 1rem; padding: 0; min-height: 0; min-width: 0; line-height: 1; border: none; background: transparent; display: flex; align-items: center;"><i data-lucide="lightbulb" style="color: var(--warning, #f39c12); width: 20px; height: 20px;"></i></button>
            ` : ''}
            <span id="mode-text" style="color: var(--text-secondary); line-height: 1;">${modeText}</span>
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
      if (!this.app.gameState.hasSeenOnboarding()) {
        this.showOnboarding(el);
      }
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
    }

    this.drawingEngine.enable();
    this.drawingEngine.render();

    // Blind mode's 20s timer only starts once the player can actually see
    // and use the canvas — deferred until the onboarding overlay (if any)
    // is dismissed, so first-time players don't lose time to it.
    if (this.mode === 'blind') {
      if (this.app.gameState.hasSeenOnboarding()) {
        this.startTimer(el);
      } else {
        this.pendingTimerEl = el;
      }
    }
  }

  startTimer(el) {
    let timeLeft = 20;
    const ringFg = el.querySelector('#timer-ring-fg');
    const numEl = el.querySelector('#timer-num');
    if (!ringFg || !numEl) return;
    
    // Total dash array length is 2*pi*r = ~100
    if (this.gameTimer) clearInterval(this.gameTimer);
    
    this.gameTimer = setInterval(() => {
      timeLeft--;
      numEl.textContent = timeLeft;
      
      const offset = 100 - (timeLeft / 20) * 100;
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
        playClick();
        this.drawingEngine.setBrushSize(size);
        this.drawingEngine.setEraser(false);
        el.querySelectorAll('.toolbar-btn').forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
      });
    }

    // Eraser
    el.querySelector('[data-action="eraser"]').addEventListener('click', (e) => {
      if (!this.drawingEngine) return;
      playClick();
      this.drawingEngine.setEraser(true);
      el.querySelectorAll('.toolbar-btn').forEach(b => b.classList.remove('active'));
      e.currentTarget.classList.add('active');
    });

    // Undo
    el.querySelector('[data-action="undo"]').addEventListener('click', () => {
      playClick();
      this.drawingEngine?.undo();
    });

    // Clear
    el.querySelector('[data-action="clear"]').addEventListener('click', () => {
      playClick();
      this.drawingEngine?.clearAll();
    });

    // Submit
    el.querySelector('[data-action="submit"]').addEventListener('click', () => {
      playSubmit();
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

  showOnboarding(el) {
    const isBlind = this.mode === 'blind';
    const step1Text = isBlind ? t('onboarding_step1_blind') : t('onboarding_step1_trace');

    const overlay = document.createElement('div');
    overlay.className = 'overlay onboarding-overlay';
    overlay.id = 'onboarding-overlay';
    overlay.innerHTML = `
      <div class="overlay-content onboarding-card animate-pop-in" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
        <div class="onboarding-step">
          <div class="onboarding-icon">
            <i data-lucide="pen-tool"></i>
            <svg class="onboarding-pen-hint" viewBox="0 0 40 40" aria-hidden="true">
              <path pathLength="100" d="M8,24 C6,12 18,6 26,12 C34,18 32,30 22,30 C14,30 10,26 14,20" />
            </svg>
          </div>
          <p id="onboarding-title" data-i18n="step1">${step1Text}</p>
        </div>
        <div class="onboarding-step">
          <div class="onboarding-icon"><i data-lucide="check-circle-2"></i></div>
          <p data-i18n="step2">${t('onboarding_step2')}</p>
        </div>
        <div class="onboarding-step">
          <div class="onboarding-icon"><i data-lucide="star"></i></div>
          <p data-i18n="step3">${t('onboarding_step3')}</p>
        </div>
        <div class="onboarding-actions">
          <button class="btn btn-secondary" data-action="onboarding-skip" data-i18n="skip">${t('onboarding_skip')}</button>
          <button class="btn btn-primary" data-action="onboarding-done" data-i18n="done">${t('onboarding_got_it')}</button>
        </div>
      </div>
    `;

    el.appendChild(overlay);
    if (window.lucide) window.lucide.createIcons({ root: overlay });

    // Block drawing under the overlay defensively (the full-screen overlay
    // already intercepts pointer events, but this keeps intent explicit).
    const canvasContainer = el.querySelector('#drawing-canvas');
    if (canvasContainer) canvasContainer.style.pointerEvents = 'none';

    // The back button stays reachable above the overlay (like the top-right
    // theme/language toggles) so leaving mid-onboarding always works; the
    // canvas and toolbar remain blocked.
    const backBtn = el.querySelector('[data-action="back"]');
    if (backBtn) backBtn.classList.add('onboarding-above-overlay');

    const dismiss = () => this.dismissOnboarding(el);
    overlay.querySelector('[data-action="onboarding-skip"]').addEventListener('click', dismiss);
    const doneBtn = overlay.querySelector('[data-action="onboarding-done"]');
    doneBtn.addEventListener('click', dismiss);
    doneBtn.focus();
  }

  dismissOnboarding(el) {
    const overlay = el.querySelector('#onboarding-overlay');
    if (overlay) overlay.remove();

    const canvasContainer = el.querySelector('#drawing-canvas');
    if (canvasContainer) canvasContainer.style.pointerEvents = '';

    const backBtn = el.querySelector('[data-action="back"]');
    if (backBtn) backBtn.classList.remove('onboarding-above-overlay');

    this.app.gameState.setOnboardingSeen();

    if (this.pendingTimerEl) {
      this.startTimer(this.pendingTimerEl);
      this.pendingTimerEl = null;
    }
  }

  showHint() {
    if (this.hintActive || !this.drawingEngine) return;
    if (this.hintsRemaining <= 0) {
      this.app.showToast(t('toast_no_hints'));
      return;
    }

    this.hintsRemaining--;
    this.hintActive = true;
    playHint();
    this.app.gameState.recordHintUsed();
    
    // Update hint button title
    const hintBtn = document.getElementById('btn-hint');
    if (hintBtn) {
      hintBtn.title = t('hint_title', {count: this.hintsRemaining});
      if (this.hintsRemaining === 0) {
        hintBtn.style.opacity = '0.5';
        hintBtn.classList.remove('animate-breathe');
      }
    }
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

    // Remove hint after 2 seconds
    this.hintTimer = setTimeout(() => {
      this.drawingEngine.setExtraRender(originalExtra);
      this.drawingEngine.render();
      this.hintActive = false;
    }, 2000);

    this.app.showToast(t('toast_hint_shown', { count: this.hintsRemaining }));
  }

  submitDrawing() {
    if (!this.drawingEngine || !this.drawingEngine.hasDrawing()) {
      // In blind mode with timer running out, user might have drawn nothing.
      // We can just give them a 0 score instead of blocking.
      if (this.gameTimer) {
        // They ran out of time
      } else {
        this.app.showToast(t('toast_draw_first'));
        return;
      }
    }

    const comparison = new ComparisonEngine();
    const result = comparison.compare(
      this.canvasManager,
      this.drawingEngine,
      this.region.path
    );

    const session = this.app.gameState.session;
    
    // Save to permanent stats ONLY if single player
    let isNewBest = false;
    if (session.playerCount === 1) {
      isNewBest = this.app.gameState.completeRegion(
        this.region.id,
        result.score,
        result.rank
      );
      if (session.isDaily) {
        this.app.gameState.recordDailyResult(this.region.id, result.score);
      }
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

  updateLanguage() {
    const el = document.getElementById('game-screen');
    if (!el) return;

    // Update region name
    const lang = getLanguage();
    const isEnglishName = lang === 'en' && !!this.region.nameEn;
    const rName = isEnglishName ? this.region.nameEn : this.region.name;
    const rnEl = el.querySelector('#region-name');
    if (rnEl) rnEl.textContent = localeUpperCase(rName, isEnglishName);

    // Update mode text
    const modeText = this.app.gameState.session.isDaily
      ? t('mode_text_daily')
      : this.mode === 'blind' ? t('mode_text_blind') : t('mode_text_trace');
    const mtEl = el.querySelector('#mode-text');
    if (mtEl) mtEl.textContent = modeText;

    // Update hint button
    const hintBtn = el.querySelector('#btn-hint');
    if (hintBtn) hintBtn.title = t('hint_title', {count: this.hintsRemaining});

    // Update onboarding overlay, if still showing
    const onboardingOverlay = el.querySelector('#onboarding-overlay');
    if (onboardingOverlay) {
      const step1El = onboardingOverlay.querySelector('[data-i18n="step1"]');
      if (step1El) step1El.textContent = this.mode === 'blind' ? t('onboarding_step1_blind') : t('onboarding_step1_trace');
      const step2El = onboardingOverlay.querySelector('[data-i18n="step2"]');
      if (step2El) step2El.textContent = t('onboarding_step2');
      const step3El = onboardingOverlay.querySelector('[data-i18n="step3"]');
      if (step3El) step3El.textContent = t('onboarding_step3');
      const skipBtn = onboardingOverlay.querySelector('[data-i18n="skip"]');
      if (skipBtn) skipBtn.textContent = t('onboarding_skip');
      const doneBtn = onboardingOverlay.querySelector('[data-i18n="done"]');
      if (doneBtn) doneBtn.textContent = t('onboarding_got_it');
    }

    // Update toolbar buttons
    const tools = ['thin', 'medium', 'thick', 'eraser', 'undo', 'clear', 'submit'];
    for (const tool of tools) {
      const btn = el.querySelector(`[data-action="${tool === 'thin' || tool === 'medium' || tool === 'thick' ? 'brush-' + tool : tool}"]`);
      if (btn) {
        btn.title = t(`tool_${tool}_title`);
        const span = btn.querySelector('span');
        if (span) span.textContent = t(`tool_${tool}`);
      }
    }
  }

  cleanup() {
    if (this.gameTimer) {
      clearInterval(this.gameTimer);
      this.gameTimer = null;
    }
    if (this.hintTimer) clearTimeout(this.hintTimer);
    // Whole screen (onboarding overlay included) is about to be discarded by
    // navigateTo() — drop the deferred-timer reference so nothing tries to
    // start a timer against a detached element later.
    this.pendingTimerEl = null;
    this.drawingEngine?.destroy();
    this.canvasManager?.destroy();
    this.drawingEngine = null;
    this.canvasManager = null;
  }
}
