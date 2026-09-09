import { getRegionById } from '../data/levels.js';
import { t, getLanguage, localeUpperCase } from '../i18n.js';
import { CanvasManager } from '../engine/canvas-manager.js';
import { DrawingEngine } from '../engine/drawing-engine.js';
import { ComparisonEngine } from '../engine/comparison-engine.js';
import { playClick, playSubmit, playHint } from '../engine/audio-engine.js';
import { track } from '../engine/analytics.js';
import { getContextCanvas, getTargetStyle } from '../engine/context-renderer.js';
import { loadRegionGeometry } from '../engine/region-geometry.js';
import * as portalSdk from '../engine/portal-sdk.js';

// Brush size names (persisted on GameState, #24) to the DrawingEngine lineWidth they map to.
const BRUSH_WIDTHS = { thin: 2, medium: 3, thick: 6 };

/**
 * GameScreen - Main drawing gameplay screen
 * Supports trace mode (with silhouette) and blind mode (from memory)
 */
export class GameScreen {
  constructor(app) {
    this.app = app;
    this.canvasManager = null;
    this.drawingEngine = null;
    this.canvasContainerEl = null;
    this.submitBtn = null;
    this.region = null;
    this.mode = 'trace';
    this.hintActive = false;
    this.hintTimer = null;
    this.hintsRemaining = 3;
    this.pendingTimerEl = null;
    this.submitFeedbackTimer = null;
    // Neighbour context (#18c, trace mode only) — set once the async
    // getContextCanvas() build resolves; `renderToken` guards against a
    // resolution from a previous round landing after the player has
    // already moved on (this screen instance is reused across rounds).
    this.contextCanvas = null;
    this.renderToken = 0;
    // #20 follow-up: guards the async loadRegionGeometry() below the same
    // way — a Retry/Back/Next that starts a NEW round before a previous
    // round's geometry fetch resolves must not have that stale fetch
    // overwrite `this.region` out from under the new round.
    this.geomToken = 0;
  }

  render(regionId, mode) {
    this.region = getRegionById(regionId);
    this.mode = mode;
    if (!this.region) return document.createElement('div');

    // Fresh hint allowance for every game (screen instances are reused)
    this.hintsRemaining = 3;
    this.hintActive = false;
    this.pendingTimerEl = null;
    this.submitFeedbackTimer = null;

    const session = this.app.gameState.session;
    track('game_start', {
      mode, region: regionId, players: session.playerCount, daily: !!session.isDaily,
    });

    const theme = this.app.gameState.getTheme();
    const myGeomToken = ++this.geomToken;
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
    const savedBrush = this.app.gameState.getBrushSize();

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
        <button class="toolbar-btn${savedBrush === 'thin' ? ' active' : ''}" data-action="brush-thin" title="${t('tool_thin_title')}">
          <i data-lucide="pen-tool"></i>
          <span>${t('tool_thin')}</span>
        </button>
        <button class="toolbar-btn${savedBrush === 'medium' ? ' active' : ''}" data-action="brush-medium" title="${t('tool_medium_title')}">
          <i data-lucide="pen"></i>
          <span>${t('tool_medium')}</span>
        </button>
        <button class="toolbar-btn${savedBrush === 'thick' ? ' active' : ''}" data-action="brush-thick" title="${t('tool_thick_title')}">
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

    // Initialize after DOM insertion. Geometry (path/rings/context) is a
    // lazy per-region chunk (#20 follow-up) — awaited here before drawing
    // anything; a few KB, so no loading state is shown. `myGeomToken` drops
    // a stale resolution if the player has already left this round (retry/
    // back/next all reuse this same GameScreen instance).
    requestAnimationFrame(async () => {
      const geometry = await loadRegionGeometry(regionId);
      if (myGeomToken !== this.geomToken) return;
      this.region = { ...this.region, ...geometry };

      this.initCanvas(el, theme);
      // #23: idempotent — a no-op here for the (common) case where
      // main.js's own showHome()+loadingStop() already fired for a normal
      // (non-deep-linked, non-instant-play) round; the real first call for
      // a deep-linked/instant-play round.
      portalSdk.loadingStop();
      if (!this.app.gameState.hasSeenOnboarding()) {
        this.showOnboarding(el);
      } else {
        // #23: onboarding already seen — the player can draw immediately,
        // so gameplay starts right here. Otherwise it starts once
        // dismissOnboarding() below is called.
        portalSdk.gameplayStart();
      }
    });

    // Event listeners
    this.setupEvents(el);

    return el;
  }

  initCanvas(el, theme) {
    const container = el.querySelector('#drawing-canvas');
    if (!container) return;

    // Read from `this.theme` (not the `theme` parameter) inside the
    // extraRenderFn closures below, and keep it updated on every theme
    // change (see refreshContext) — otherwise a mid-round toggle updates
    // the context layer and the rest of the UI but leaves the target's own
    // fill/edge/dashed-guide color stuck at whatever theme the round
    // started in, since a closure capturing the OLD `theme` argument keeps
    // reading it on every subsequent stroke render.
    this.theme = theme;
    this.canvasContainerEl = container;
    this.canvasManager = new CanvasManager(container);
    this.drawingEngine = new DrawingEngine(this.canvasManager, {
      theme,
      color: theme === 'night' ? '#00f5d4' : '#3d2b1f',
      lineWidth: BRUSH_WIDTHS[this.app.gameState.getBrushSize()] || BRUSH_WIDTHS.medium,
      // First stroke of the round: a subtle one-shot glow so it's obvious
      // the canvas is drawable.
      onFirstStroke: () => {
        container.classList.add('canvas-first-stroke-glow');
      },
    });

    // Multi-part regions (#18): render every ring (islands included) for
    // the visible outline — but always fit against the main ring alone
    // (renderRegionRings/normalizeRingsToCanvas), the same transform
    // ComparisonEngine scores against. `rings` may be absent on
    // DOM-free-test region stubs, hence the fallback.
    const rings = this.region.rings || [this.region.path];

    // In trace mode, show the silhouette as background
    if (this.mode === 'trace') {
      // Neighbour context (#18c) — trace mode only, never blind. Built
      // once, asynchronously (a lazy per-category chunk fetch the first
      // time), then just drawImage()'d every render — never rebuilt per
      // stroke. `myToken` guards a late resolution from applying itself
      // after the player has already left this round (retry/back/next all
      // reuse this same GameScreen instance).
      this.contextCanvas = null;
      const myToken = ++this.renderToken;
      getContextCanvas(this.region, this.canvasManager.width, this.canvasManager.height, theme)
        .then((canvas) => {
          if (myToken !== this.renderToken || !canvas) return;
          this.contextCanvas = canvas;
          this.drawingEngine?.render();
        });

      this.drawingEngine.setExtraRender(() => {
        if (this.contextCanvas) {
          this.canvasManager.getContext().drawImage(
            this.contextCanvas, 0, 0, this.canvasManager.width, this.canvasManager.height
          );
        }
        // Target region (#18 restyle): a Google-Maps-"selection"-style solid
        // fill + edge, applied identically to EVERY ring (this — not the
        // dash — is what fixed islands like Hokkaido reading as a
        // different, inconsistent grey from the mainland), then the
        // existing dashed trace guide layered on top of that as a second pass.
        const targetStyle = getTargetStyle(this.theme);
        this.canvasManager.renderRegionRings(rings, {
          color: targetStyle.edge,
          lineWidth: 1.5,
          fill: true,
          fillColor: targetStyle.fill,
        });
        this.canvasManager.renderRegionRings(rings, {
          color: this.theme === 'night' ? 'rgba(0,245,212,0.5)' : 'rgba(92,64,51,0.4)',
          lineWidth: 2,
          lineDash: [8, 6],
          opacity: 0.8,
        });
      });
    } else {
      this.renderToken++; // invalidate any in-flight context build from a previous (trace) round
      this.contextCanvas = null;
      // Blind mode 5% hint — renderRegionRings never reveals islands via a
      // hint, only ever a fraction of the main ring (see its own doc comment).
      this.drawingEngine.setExtraRender(() => {
        this.canvasManager.renderRegionRings(rings, {
          hintPercent: 0.05,
          color: this.theme === 'night' ? 'rgba(255,215,0,0.6)' : 'rgba(218,165,32,0.6)', // Golden/Brass
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
      this.app.abandonActiveChain();
      this.app.showLevelSelect();
    });

    // Brush sizes
    for (const [name, size] of Object.entries(BRUSH_WIDTHS)) {
      el.querySelector(`[data-action="brush-${name}"]`).addEventListener('click', (e) => {
        if (!this.drawingEngine) return;
        playClick();
        this.drawingEngine.setBrushSize(size);
        this.drawingEngine.setEraser(false);
        this.app.gameState.setBrushSize(name);
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

    // Submit — immediate tactile feedback (button press pulse + a quick
    // canvas fade) so a tap never feels like "nothing happened", and the
    // button is disabled for that same short window to prevent double
    // submits. The actual scoring is only delayed by the feedback window.
    this.submitBtn = el.querySelector('[data-action="submit"]');
    this.submitBtn.addEventListener('click', () => {
      if (this.submitBtn.disabled) return;
      this.submitBtn.disabled = true;
      playSubmit();
      this.submitBtn.classList.add('animate-submit-pulse');
      this.canvasContainerEl?.classList.add('canvas-submit-fade');
      this.submitFeedbackTimer = setTimeout(() => {
        this.submitFeedbackTimer = null;
        this.submitDrawing();
      }, 220);
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

    overlay.querySelector('[data-action="onboarding-skip"]').addEventListener('click', () => this.dismissOnboarding(el, 'skip'));
    const doneBtn = overlay.querySelector('[data-action="onboarding-done"]');
    doneBtn.addEventListener('click', () => this.dismissOnboarding(el, 'done'));
    doneBtn.focus();
  }

  dismissOnboarding(el, action) {
    track('onboarding_dismiss', { action });
    const overlay = el.querySelector('#onboarding-overlay');
    if (overlay) overlay.remove();

    const canvasContainer = el.querySelector('#drawing-canvas');
    if (canvasContainer) canvasContainer.style.pointerEvents = '';

    const backBtn = el.querySelector('[data-action="back"]');
    if (backBtn) backBtn.classList.remove('onboarding-above-overlay');

    this.app.gameState.setOnboardingSeen();
    // #23: the player can only actually start drawing once the overlay is
    // gone — this is the gameplayStart() for a first-time player (see
    // render()'s requestAnimationFrame callback for the already-seen case).
    portalSdk.gameplayStart();

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
      this.canvasManager.renderRegionRings(this.region.rings || [this.region.path], {
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
        // Staying on this screen (no navigation) — undo the submit button's
        // press feedback so it isn't left disabled/dimmed with nothing to
        // follow it up.
        this.resetSubmitFeedback();
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

    track('game_submit', {
      mode: this.mode, region: this.region.id, score: result.score,
      rank: result.rank.nameEn, daily: !!session.isDaily,
      hints_used: 3 - this.hintsRemaining,
    });

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

  /**
   * Re-fetches the neighbour-context canvas when the theme OR language
   * changes mid-round (main.js's theme button, and updateLanguage() below,
   * both call this) — otherwise a trace-mode round would keep showing the
   * old theme's sea/land colors or the old language's neighbour labels
   * until the next round starts. `getContextCanvas` itself reads the
   * current language, so `theme` is the only thing callers need to pass.
   * No-op outside trace mode (this.contextCanvas is always null there).
   */
  refreshContext(theme) {
    // Keeps the target's own fill/edge/dashed-guide color (read from
    // `this.theme` by the extraRenderFn closures set up in initCanvas) in
    // sync too — not just the context layer below — see initCanvas's
    // comment on `this.theme` for why a plain `theme` closure parameter
    // isn't enough here.
    this.theme = theme;
    if (this.mode !== 'trace' || !this.canvasManager) {
      this.drawingEngine?.render();
      return;
    }
    this.contextCanvas = null;
    const myToken = ++this.renderToken;
    getContextCanvas(this.region, this.canvasManager.width, this.canvasManager.height, theme)
      .then((canvas) => {
        if (myToken !== this.renderToken || !canvas) return;
        this.contextCanvas = canvas;
        this.drawingEngine?.render();
      });
  }

  updateLanguage() {
    const el = document.getElementById('game-screen');
    if (!el) return;

    // Neighbour context (#18c): its labels are localized and cached per
    // language — without this call, the old language's labels would stick
    // around until the next round starts.
    this.refreshContext(this.app.gameState.getTheme());

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
    // #23: every way of leaving a round (back, submit, timer-expiry submit,
    // navigating away entirely) routes through here — a single hook point,
    // idempotent (a no-op if gameplay never started, e.g. Back pressed
    // during onboarding).
    portalSdk.gameplayStop();
    // #20 follow-up: invalidates any in-flight loadRegionGeometry() for the
    // round being abandoned — without this, a Back press before geometry
    // resolves (this.canvasManager/drawingEngine are still null at that
    // point, so the destroy() calls below are no-ops) let that resolution
    // land later anyway, building a real CanvasManager/DrawingEngine
    // (ResizeObserver + pointer listeners) against this now-detached
    // screen's DOM — a leak `render()`'s own token bump never catches
    // because it only guards against a NEW round starting, not against no
    // next round starting at all.
    this.geomToken++;
    if (this.gameTimer) {
      clearInterval(this.gameTimer);
      this.gameTimer = null;
    }
    if (this.hintTimer) clearTimeout(this.hintTimer);
    if (this.submitFeedbackTimer) {
      clearTimeout(this.submitFeedbackTimer);
      this.submitFeedbackTimer = null;
    }
    // Whole screen (onboarding overlay included) is about to be discarded by
    // navigateTo() — drop the deferred-timer reference so nothing tries to
    // start a timer against a detached element later.
    this.pendingTimerEl = null;
    this.drawingEngine?.destroy();
    this.canvasManager?.destroy();
    this.drawingEngine = null;
    this.canvasManager = null;
  }

  /**
   * Undoes the Submit button's press feedback (re-enables it, drops the
   * pulse/fade classes) for the one path where submitDrawing() decides not
   * to submit after all and the player stays on this screen — otherwise
   * the button would be stuck disabled with no result screen coming.
   */
  resetSubmitFeedback() {
    if (this.submitBtn) {
      this.submitBtn.disabled = false;
      this.submitBtn.classList.remove('animate-submit-pulse');
    }
    this.canvasContainerEl?.classList.remove('canvas-submit-fade');
  }
}
