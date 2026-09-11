import { t, getLanguage, localeUpperCase } from '../i18n.js';
import { getRank, getRegionById, getAllRegions } from '../data/levels.js';
import { playResult, playTick, isHighRank } from '../engine/audio-engine.js';
import { startCountUp } from '../engine/count-up.js';
import { track } from '../engine/analytics.js';
import { resolveNextRegion } from '../engine/region-nav.js';
import { nextChainRegion } from '../data/neighbors.js';
import { applyChainLink, shouldEndChain } from '../engine/chain-engine.js';
import { getDailyRegionPool, getDailyRegionIds, getDailyProgress, todayStr } from '../engine/daily.js';
import { normalizeRingsToCanvasPoints, visibleRingFraction } from '../engine/canvas-manager.js';
import * as portalSdk from '../engine/portal-sdk.js';
import { getContextCanvas, getTargetStyle } from '../engine/context-renderer.js';
import { computeMoreRowState } from '../engine/result-more-row.js';
import { formatRunHud } from '../engine/run-engine.js';

/**
 * Shrink `text` (drawn in the given weight, starting at `baseSize`px) until
 * it fits within `maxWidth`, stepping the font size down to `floor` × base;
 * if it still doesn't fit at the floor, ellipsize it. Leaves `ctx.font` set
 * to the size actually used. Returns `{ text, size }`.
 */
function fitText(ctx, text, baseSize, weight, maxWidth, floor = 0.6) {
  const minSize = Math.max(1, Math.round(baseSize * floor));
  let size = baseSize;
  const setFont = (s) => { ctx.font = `${weight} ${s}px Outfit, system-ui, sans-serif`; };
  setFont(size);
  while (ctx.measureText(text).width > maxWidth && size > minSize) {
    size -= 1;
    setFont(size);
  }
  let fitted = text;
  if (ctx.measureText(fitted).width > maxWidth) {
    while (fitted.length > 1 && ctx.measureText(fitted + '…').width > maxWidth) {
      fitted = fitted.slice(0, -1);
    }
    if (fitted.length < text.length) fitted += '…';
  }
  return { text: fitted, size };
}

export class ResultScreen {
  constructor(app) {
    this.app = app;
    this.countUpCancels = [];
    this.confettiRaf = null;
    this.confettiCanvas = null;
  }

  render(region, result, mode, isNewBest) {
    // Screen instances are reused — cancel any count-up/confetti still
    // running from a previous visit before building the new one.
    this.cleanup();

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

    const p1Rank = isMultiplayer ? getRank(p1Score) : rank;
    const p2Rank = isMultiplayer ? getRank(p2Score) : null;

    const p1Visual = isMultiplayer ? session.p1VisualData : visualData;
    const p2Visual = isMultiplayer ? visualData : null;

    const nextTarget = resolveNextRegion(region.id, mode, (levelId) => this.app.gameState.isLevelUnlocked(levelId));

    // Neighbor Chain (#15) — single-player only. Computes what applying this
    // round to the active chain (if any) WOULD look like, purely, for the
    // HUD/button below — but doesn't commit it (mutate session.chain, save
    // bestChain, or fire chain_link/chain_end) until the player actually
    // presses the primary button. That way "Retry" (which never reads
    // `this.chainOutcome`) leaves the chain exactly as it was before this
    // round, letting a bad link be redrawn instead of locking it in.
    this.chainOutcome = null;
    if (!isMultiplayer && session.chain?.active) {
      const regionsById = Object.fromEntries(getAllRegions().map((r) => [r.id, r]));
      const playedIds = [...session.chain.links.map((l) => l.region), region.id];
      const nextRegionId = nextChainRegion(region.id, playedIds, regionsById);
      const previewChain = applyChainLink(session.chain, region.id, score, nextRegionId);
      const ended = !previewChain.active;
      const reason = ended ? (shouldEndChain(score) ? 'score' : 'exhausted') : null;
      this.chainOutcome = { ended, chain: previewChain, reason };
    }

    // Daily Triple (#17) — single-player only, and never during a chain
    // round (the two never actually co-occur, but this keeps them from
    // fighting over the primary button if they somehow did). Unlike the
    // chain, there's nothing to preview/defer here: game-screen.js already
    // called recordDailyResult() (a plain best-of-day write, safe to repeat
    // on retry) before navigating here, so gameState already reflects this
    // round.
    this.dailyOutcome = null;
    if (!isMultiplayer && session.isDaily && !session.chain?.active) {
      const dailyRegionIds = getDailyRegionIds(todayStr(), getDailyRegionPool(), 3);
      const entry = this.app.gameState.getDailyEntry(todayStr());
      const progress = getDailyProgress(entry, dailyRegionIds);
      this.dailyOutcome = { dailyRegionIds, progress };
    }

    // Sefer / Run mode (#30) — single-player only, and never alongside a
    // chain round (hard exclusion — see startRun()/startChain()'s mutual
    // clearActiveRun() calls). Same preview-then-commit split as the
    // chain above, for the same reason: recordRunRegionScore()/
    // completeRun() are only called from the primary button's click
    // handler, so "Tekrar Oyna" never advances the run.
    this.runOutcome = null;
    if (!isMultiplayer && session.isRunRegion) {
      const run = this.app.gameState.getActiveRun();
      if (run) {
        const index = run.index + 1; // 1-based count completed AFTER this round
        const total = run.scores.reduce((sum, s) => sum + s, 0) + score;
        this.runOutcome = { index, total, isComplete: index >= run.regionIds.length };
      }
    }

    // "More" row (#21) — Neighbor Chain / Daily Triple entry points on a
    // NORMAL round's result only (see computeMoreRowState's own doc
    // comment for exactly when it's hidden). Today's Daily Triple progress
    // is read independently of `this.dailyOutcome` above (which is only set
    // while a daily ROUND itself is in progress) since the "More" row needs
    // to know today's status even on an unrelated round's result.
    const todaysDailyRegionIds = getDailyRegionIds(todayStr(), getDailyRegionPool(), 3);
    const todaysDailyEntry = this.app.gameState.getDailyEntry(todayStr());
    const todaysDailyProgress = getDailyProgress(todaysDailyEntry, todaysDailyRegionIds);
    const moreRowState = computeMoreRowState({
      isMultiplayer,
      chainOutcome: this.chainOutcome,
      dailyOutcome: this.dailyOutcome,
      runOutcome: this.runOutcome,
      dailyProgress: todaysDailyProgress,
      bestChain: this.app.gameState.getBestChain(),
    });

    // #30: the run HUD replaces the mode label here too — issue #30
    // explicitly calls out both the game AND result screen headers.
    // `this.runOutcome` already reflects this round's score committed (a
    // preview — see its own comment above), matching what the primary
    // button below is about to act on. formatRunHud() is shared with
    // game-screen.js's getModeText() so the width threshold and the
    // index/total reading can't drift between the two (#30 review).
    let modeText;
    if (this.runOutcome) {
      const { key, params } = formatRunHud({ index: this.runOutcome.index, total: this.runOutcome.total, viewportWidth: window.innerWidth });
      modeText = t(key, params);
    } else {
      modeText = session.isDaily ? t('mode_text_daily') : (mode === 'blind' ? t('mode_text_blind') : t('mode_text_trace'));
    }
    const lang = getLanguage();
    const isEnglishName = lang === 'en' && !!region.nameEn;
    const rName = isEnglishName ? region.nameEn : region.name;
    const regionName = localeUpperCase(rName, isEnglishName);

    const renderPlayerHtml = (num, pRank, vData) => {
      const rankName = lang === 'en' ? pRank.nameEn : pRank.name;
      // Ensure the text wrapper is exactly the same width as the canvas
      const widthStr = vData ? `max-width: ${vData.canvasWidth}px;` : 'width: 100%;';
      // #27: in 2-player mode the two headers sit side by side, each capped
      // to its own (much narrower) canvas width — only the rightmost one
      // (player 2) can ever reach the fixed .top-controls in the corner, so
      // only it reserves room for them; reserving on player 1's (leftmost,
      // nowhere near the buttons) would just needlessly ellipsis its region
      // name for no benefit.
      const nearTopControls = !isMultiplayer || num === 2;
      return `
      <div style="display: flex; flex-direction: column; width: 100%; ${widthStr} margin: 0 auto;">
        <div class="top-header-row${nearTopControls ? ' top-header-row-reserve' : ''}" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; text-transform: uppercase; font-size: 0.9rem; font-weight: bold; letter-spacing: 1px; height: 1.5rem;">
          <div class="top-header-row-left" style="display: flex; align-items: center; gap: 0.5rem;">
            <button style="visibility: hidden; font-size: 1.2rem; padding: 0; min-height: 0; min-width: 0; line-height: 1; border: none; background: transparent;"><i data-lucide="arrow-left"></i></button>
            <span class="top-header-row-name" style="color: var(--text-primary); line-height: 1;">${regionName}${isMultiplayer ? ` (${t('player')}${num})` : ''}</span>
          </div>
          <div class="top-header-row-right" style="display: flex; align-items: center;">
            ${isMultiplayer
              ? `<span id="p${num}-result-label" class="top-header-row-mode-text" style="color: var(--text-secondary); line-height: 1; visibility: hidden;"></span>`
              : `<span class="top-header-row-mode-text${this.runOutcome ? ' top-header-row-run-hud' : ''}" style="color: var(--text-secondary); line-height: 1;">${modeText}</span>`}
          </div>
        </div>
        <div id="p${num}-canvas-container" style="width: 100%; margin: 1rem auto; background: var(--button-bg); border-radius: var(--radius-md); padding: 1rem; border: 1px solid var(--border-color);"></div>
        <div style="display: flex; gap: 1rem; margin-top: 1rem;">
          <div style="flex:1; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1rem; display: flex; flex-direction: column; align-items: center; justify-content: center; box-shadow: var(--shadow);">
            <span style="font-size: 0.7rem; text-transform: uppercase; color: var(--text-secondary); letter-spacing: 1px; font-weight: 600; margin-bottom: 0.25rem;">${t('result_score')}</span>
            <div style="display: flex; align-items: baseline; gap: 0.25rem;">
              <span id="p${num}-score-value" style="font-size: 2rem; font-weight: 700; color: var(--accent-primary); line-height: 1;">0</span>
              <span style="font-size: 0.85rem; color: var(--text-secondary); font-weight: 600;">/ 100</span>
            </div>
          </div>
          <div style="flex:1; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1rem; display: flex; flex-direction: column; align-items: center; justify-content: center; box-shadow: var(--shadow);">
            <span style="font-size: 0.7rem; text-transform: uppercase; color: var(--text-secondary); letter-spacing: 1px; font-weight: 600; margin-bottom: 0.25rem;">${t('result_avg_dev')}</span>
            <span style="font-size: 2rem; font-weight: 700; color: var(--accent-primary); line-height: 1;">${vData?.avgDeviationPercent ?? 0}%</span>
          </div>
        </div>
        <div id="p${num}-rank-badge" class="result-rank-badge" style="display: none; align-self: center;">${pRank.badge} ${rankName}</div>
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

    let extraHudHtml = '';
    let primaryButtonLabel = t('next_region');
    if (this.chainOutcome) {
      const { chain } = this.chainOutcome;
      extraHudHtml = `
        <div style="display:flex; align-items:center; gap:0.4rem; background: var(--button-bg); padding: 0.4rem 0.9rem; border-radius: var(--radius-full); font-size: 0.8rem; font-weight: 600; color: var(--text-primary); border: 1px solid var(--border-color);">
          <i data-lucide="route" style="width:14px; height:14px; color: var(--accent-primary);"></i>
          ${t('chain_hud', { count: chain.links.length, multiplier: chain.multiplier.toFixed(1), total: chain.total })}
        </div>
      `;
      if (this.chainOutcome.ended) {
        primaryButtonLabel = t('chain_view_summary');
      } else {
        const nextRegion = getRegionById(chain.nextRegionId);
        const nextIsEnglish = lang === 'en' && !!nextRegion?.nameEn;
        const nextName = nextRegion ? (nextIsEnglish ? nextRegion.nameEn : nextRegion.name) : '';
        primaryButtonLabel = t('chain_next_neighbor', { region: nextName });
      }
    } else if (this.dailyOutcome) {
      const { progress } = this.dailyOutcome;
      extraHudHtml = `
        <div style="display:flex; align-items:center; gap:0.4rem; background: var(--button-bg); padding: 0.4rem 0.9rem; border-radius: var(--radius-full); font-size: 0.8rem; font-weight: 600; color: var(--text-primary); border: 1px solid var(--border-color);">
          <i data-lucide="calendar" style="width:14px; height:14px; color: var(--accent-primary);"></i>
          ${t('daily_hud', { played: progress.playedCount, total: progress.total })}
        </div>
      `;
      primaryButtonLabel = progress.isComplete
        ? t('daily_view_summary')
        : t('daily_next', { n: progress.playedCount + 1 });
    } else if (this.runOutcome) {
      // No extraHudHtml chip here (unlike chain/daily): the run status
      // already lives in the header (#30's getModeText() in game-screen.js
      // — the header stays wired to the LIVE session there, not this
      // preview), so a second copy below the canvas would just be noise.
      primaryButtonLabel = this.runOutcome.isComplete
        ? t('run_view_summary')
        : t('run_next', { index: this.runOutcome.index + 1 });
    }

    el.innerHTML = `
      <div style="display: flex; flex-direction: ${isMultiplayer ? 'row' : 'column'}; gap: 2rem; width: 100%;">
        ${renderPlayerHtml(1, p1Rank, p1Visual)}
        ${isMultiplayer ? renderPlayerHtml(2, p2Rank, p2Visual) : ''}
      </div>

      <div style="display: flex; flex-direction: column; align-items: center; margin-top: 2rem; gap: 1rem; margin-bottom: 2rem;">
        ${extraHudHtml}
        <button class="btn btn-primary" data-action="next-region" style="display: flex; align-items: center; gap: 0.5rem; padding: 0.75rem 2rem; border-radius: var(--radius-full); font-size: 1rem; font-weight: 600; box-shadow: var(--shadow); border: none;">
          <i data-lucide="arrow-right" style="width: 20px; height: 20px;"></i> ${primaryButtonLabel}
        </button>
        <div style="display: flex; gap: 0.75rem; flex-wrap: wrap; justify-content: center;">
          <button class="btn btn-secondary" data-action="retry" style="display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 1.5rem; border-radius: var(--radius-full); font-size: 0.85rem; font-weight: 500; border: none; background: var(--button-bg);">
            <i data-lucide="rotate-ccw" style="width: 16px; height: 16px;"></i> ${t('play_again')}
          </button>
          <button class="btn btn-secondary" data-action="share" style="display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 1.5rem; border-radius: var(--radius-full); font-size: 0.85rem; font-weight: 500; border: none; background: var(--button-bg);">
            <i data-lucide="share-2" style="width: 16px; height: 16px;"></i> ${t('result_share')}
          </button>
          <button class="btn btn-secondary" data-action="next" style="display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 1.5rem; border-radius: var(--radius-full); font-size: 0.85rem; font-weight: 500; border: none; background: var(--button-bg);">
            <i data-lucide="home" style="width: 16px; height: 16px;"></i> ${t('back_to_menu')}
          </button>
        </div>
      </div>

      ${moreRowState ? `
      <div style="width: 100%; max-width: 460px; margin: 0 auto 1.5rem; text-align: center;">
        <h4 style="font-size: 0.7rem; text-transform: uppercase; letter-spacing: 1px; color: var(--text-secondary); font-weight: 600; margin: 0 0 0.5rem;">${t('result_more_title')}</h4>
        <div style="display: flex; gap: 0.6rem; flex-wrap: wrap; justify-content: center;">
          <div class="card" data-action="more-chain" style="flex: 1 1 150px; max-width: 220px; cursor: pointer; padding: 0.65rem 0.85rem; text-align: left; display: flex; align-items: center; gap: 0.6rem;">
            <i data-lucide="route" style="width: 1.3rem; height: 1.3rem; color: var(--accent-primary); flex-shrink: 0;"></i>
            <div style="min-width: 0;">
              <div style="font-size: 0.8rem; font-weight: 600; color: var(--text-primary);">${t('chain_title')}</div>
              <div style="font-size: 0.7rem; color: var(--text-secondary); margin-top: 0.1rem;">${moreRowState.bestChain ? t('chain_best', { links: moreRowState.bestChain.links, total: moreRowState.bestChain.total }) : t('chain_desc')}</div>
            </div>
          </div>
          ${moreRowState.showDaily ? `
          <div class="card" data-action="more-daily" style="flex: 1 1 150px; max-width: 220px; cursor: pointer; padding: 0.65rem 0.85rem; text-align: left; display: flex; align-items: center; gap: 0.6rem;">
            <i data-lucide="calendar" style="width: 1.3rem; height: 1.3rem; color: var(--accent-primary); flex-shrink: 0;"></i>
            <div style="min-width: 0;">
              <div style="font-size: 0.8rem; font-weight: 600; color: var(--text-primary);">${t('daily_title')}</div>
              <div style="font-size: 0.7rem; color: var(--text-secondary); margin-top: 0.1rem;">${moreRowState.dailyStarted ? t('result_daily_progress', { played: moreRowState.dailyPlayedCount }) : t('result_daily_not_started')}</div>
            </div>
          </div>
          ` : ''}
        </div>
      </div>
      ` : ''}
    `;

    requestAnimationFrame(() => {
      const p1Container = el.querySelector('#p1-canvas-container');
      if (p1Container && p1Visual) {
        this.renderComparisonCanvas(p1Container, p1Visual, theme, region);
      }

      const p2Container = el.querySelector('#p2-canvas-container');
      if (p2Container && p2Visual) {
        this.renderComparisonCanvas(p2Container, p2Visual, theme, region);
      }

      this.startScoreReveal(el, { isMultiplayer, p1Score, p2Score, p1Rank });
    });

    el.querySelector('[data-action="retry"]').addEventListener('click', () => {
      // Chain-aware: this.chainOutcome was never committed (see render()
      // above), so a chain in progress is left exactly as it was — retrying
      // a link doesn't cost the chain anything.
      this.cleanup();
      this.app.gameState.session.currentPlayer = 1;
      this.app.startGame(region.id, mode);
    });

    el.querySelector('[data-action="next-region"]').addEventListener('click', () => {
      if (this.chainOutcome) {
        // Committing here, not in render(): only now does this round's
        // result actually become part of the chain (saved bestScore,
        // GA4 chain_link/chain_end, session.chain update).
        const { chain, ended, reason } = this.chainOutcome;
        track('chain_link', { n: chain.links.length, region: region.id, score });
        this.cleanup();
        session.currentPlayer = 1;
        if (ended) {
          const isNewBestChain = this.app.gameState.recordChainResult(chain.links.length, chain.total);
          track('chain_end', { links: chain.links.length, total: chain.total, reason });
          session.chain = null;
          this.app.showChainSummary({ links: chain.links, total: chain.total, mode: chain.mode, isNewBestChain });
        } else {
          session.chain = chain;
          session.isDaily = false;
          this.app.startGame(chain.nextRegionId, chain.mode);
        }
        return;
      }

      if (this.dailyOutcome) {
        const { dailyRegionIds, progress } = this.dailyOutcome;
        this.cleanup();
        session.currentPlayer = 1;
        if (progress.isComplete) {
          track('daily_complete', { total: progress.total });
          this.app.showDailySummary({
            regionIds: dailyRegionIds,
            scores: this.app.gameState.getDailyEntry(todayStr())?.scores || {},
            total: progress.total,
            streak: this.app.gameState.getDailyStreak(),
          });
        } else {
          this.app.enterDaily(progress.nextRegionId);
        }
        return;
      }

      if (this.runOutcome) {
        // Committing here, not in render() — same reasoning as the chain
        // above: only now does this round's score actually become part of
        // the run, so "Tekrar Oyna" never advances it.
        const commit = this.app.gameState.recordRunRegionScore(score);
        track('run_region_done', { index: commit.index, score });
        this.cleanup();
        session.currentPlayer = 1;
        if (commit.isComplete) {
          const summary = this.app.gameState.completeRun();
          track('run_complete', { total: summary.total, duration_s: summary.durationS });
          session.isRunRegion = false;
          this.app.showRunSummary(summary);
        } else {
          this.app.resumeRun();
        }
        return;
      }

      track('next_region', { from: region.id, to: nextTarget?.regionId ?? null, mode });
      this.cleanup();
      this.app.gameState.session.currentPlayer = 1;
      if (nextTarget) {
        this.app.gameState.session.isDaily = false;
        this.app.startGame(nextTarget.regionId, nextTarget.mode);
      } else {
        this.app.showLevelSelect();
      }
    });

    el.querySelector('[data-action="next"]').addEventListener('click', () => {
      this.cleanup();
      this.app.abandonActiveChain();
      this.app.gameState.session.currentPlayer = 1;
      this.app.showHome();
    });

    el.querySelector('[data-action="share"]').addEventListener('click', () => {
      const scoreEntries = isMultiplayer
        ? [
            { label: `${t('player')}1`, score: p1Score },
            { label: `${t('player')}2`, score: p2Score },
          ]
        : [{ score }];
      this.shareResult(region.id, regionName, rName, scoreEntries, score, session.isDaily);
    });

    // "More" row (#21) — see computeMoreRowState/moreRowState above for when
    // this exists at all.
    if (moreRowState) {
      el.querySelector('[data-action="more-chain"]').addEventListener('click', () => {
        // Starts from the just-played region's next neighbour so the chain
        // feels like a direct continuation, not an unrelated fresh start —
        // startChain() itself falls back to a random easy region if this
        // resolves to null (every region has either a real neighbour or a
        // same-category centroid fallback, so that's only a theoretical
        // edge case with the current 65-region set).
        const regionsById = Object.fromEntries(getAllRegions().map((r) => [r.id, r]));
        const nextRegionId = nextChainRegion(region.id, [region.id], regionsById);
        this.cleanup();
        this.app.startChain(mode, { startRegionId: nextRegionId, from: 'result' });
      });

      const dailyCard = el.querySelector('[data-action="more-daily"]');
      if (dailyCard) {
        dailyCard.addEventListener('click', () => {
          track('daily_open', { progress: `${todaysDailyProgress.playedCount}/3`, from: 'result' });
          this.cleanup();
          this.app.enterDaily(todaysDailyProgress.nextRegionId);
        });
      }
    }

    return el;
  }

  /**
   * Counts each player's score up from 0 (~1s, ease-out), throttling
   * playTick() rather than firing it every frame. The rank badge for a
   * player pops in the moment their own counter lands; in 2-player mode the
   * winner/tie label only appears once BOTH counters have landed, and the
   * result fanfare (plus confetti for a top-2 rank) fires at that same
   * moment, using whichever player's rank is best.
   *
   * Both players' counters run at once but share one tick sound — only
   * player 1's counter drives playTick() — so a synced 2-player reveal
   * doesn't double up the ticking.
   *
   * Respects prefers-reduced-motion: reduce by skipping the animation
   * (scores jump straight to their final value) and never launching confetti.
   */
  startScoreReveal(el, { isMultiplayer, p1Score, p2Score, p1Rank }) {
    const prefersReducedMotion = typeof window !== 'undefined'
      && window.matchMedia
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const revealBadge = (num) => {
      const badgeEl = el.querySelector(`#p${num}-rank-badge`);
      if (!badgeEl) return;
      badgeEl.style.display = 'inline-flex';
      badgeEl.classList.add('animate-pop-in');
    };

    const revealResultLabel = () => {
      if (!isMultiplayer) return;
      const isTie = p1Score === p2Score;
      const labelFor = (mine, theirs) => (isTie ? t('result_tie') : mine > theirs ? t('result_winner') : t('result_nice_try'));
      for (const [num, mine, theirs] of [[1, p1Score, p2Score], [2, p2Score, p1Score]]) {
        const labelEl = el.querySelector(`#p${num}-result-label`);
        if (!labelEl) continue;
        labelEl.textContent = labelFor(mine, theirs);
        labelEl.style.visibility = 'visible';
        labelEl.classList.add('animate-pop-in');
      }
    };

    const finishRank = isMultiplayer ? getRank(Math.max(p1Score, p2Score)) : p1Rank;

    const onAllDone = () => {
      revealResultLabel();
      playResult(finishRank);
      if (isHighRank(finishRank)) {
        this.launchConfetti();
        portalSdk.happytime(); // #23: sparingly — top-2-rank moment only
      }
    };

    if (prefersReducedMotion) {
      const p1ValEl = el.querySelector('#p1-score-value');
      if (p1ValEl) p1ValEl.textContent = String(p1Score);
      revealBadge(1);
      if (isMultiplayer) {
        const p2ValEl = el.querySelector('#p2-score-value');
        if (p2ValEl) p2ValEl.textContent = String(p2Score);
        revealBadge(2);
      }
      revealResultLabel();
      playResult(finishRank);
      // No confetti under reduced motion, even for a top-2 rank — but #23's
      // happytime() is independent of the confetti animation, so it still
      // fires here.
      if (isHighRank(finishRank)) portalSdk.happytime();
      return;
    }

    const totalCounters = isMultiplayer ? 2 : 1;
    let doneCount = 0;
    const onCounterDone = (num) => {
      revealBadge(num);
      doneCount++;
      if (doneCount >= totalCounters) onAllDone();
    };

    const p1ValEl = el.querySelector('#p1-score-value');
    this.countUpCancels.push(startCountUp({
      target: p1Score,
      onUpdate: (v) => { if (p1ValEl) p1ValEl.textContent = String(v); },
      onTick: playTick,
      onDone: () => onCounterDone(1),
    }));

    if (isMultiplayer) {
      const p2ValEl = el.querySelector('#p2-score-value');
      this.countUpCancels.push(startCountUp({
        target: p2Score,
        onUpdate: (v) => { if (p2ValEl) p2ValEl.textContent = String(v); },
        onDone: () => onCounterDone(2),
      }));
    }
  }

  /**
   * Lightweight canvas-based confetti burst (~1.5s, ~100 particles, no
   * assets/library) for a top-2 rank reveal. Draws on its own transparent,
   * click-through canvas over the whole screen, removed when the burst ends
   * or when cleanup() runs (e.g. the player navigates away mid-burst).
   */
  launchConfetti() {
    const theme = this.app.gameState.getTheme();
    const colors = theme === 'night'
      ? ['#00f5d4', '#FFD700', '#f87171', '#FAFAFA', '#B9F2FF']
      : ['#4d94ff', '#FFD700', '#9b2226', '#1C1C1E', '#C0C0C0'];

    const canvas = document.createElement('canvas');
    canvas.className = 'confetti-canvas';
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    document.body.appendChild(canvas);
    this.confettiCanvas = canvas;

    const ctx = canvas.getContext('2d');
    const count = 100;
    const originX = canvas.width / 2;
    const originY = canvas.height * 0.25;

    const particles = Array.from({ length: count }, () => ({
      x: originX,
      y: originY,
      vx: (Math.random() - 0.5) * 9,
      vy: -(Math.random() * 7 + 4),
      size: Math.random() * 6 + 4,
      color: colors[Math.floor(Math.random() * colors.length)],
      rotation: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 0.3,
    }));

    const gravity = 0.25;
    const duration = 1500;
    const start = performance.now();

    const step = (t) => {
      const elapsed = t - start;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const fade = 1 - Math.min(1, elapsed / duration);

      for (const p of particles) {
        p.vy += gravity;
        p.x += p.vx;
        p.y += p.vy;
        p.rotation += p.vr;

        ctx.save();
        ctx.globalAlpha = fade;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        ctx.restore();
      }

      if (elapsed < duration) {
        this.confettiRaf = requestAnimationFrame(step);
      } else {
        canvas.remove();
        if (this.confettiCanvas === canvas) this.confettiCanvas = null;
        this.confettiRaf = null;
      }
    };
    this.confettiRaf = requestAnimationFrame(step);
  }

  /**
   * Cancels any running score count-ups and stops/removes any in-flight
   * confetti. Called at the start of every render() (screen instances are
   * reused) and before navigating away via retry/next, so nothing keeps
   * ticking, playing sounds, or drawing after the screen is gone.
   */
  cleanup() {
    for (const cancel of this.countUpCancels) cancel();
    this.countUpCancels = [];

    if (this.confettiRaf != null) {
      cancelAnimationFrame(this.confettiRaf);
      this.confettiRaf = null;
    }
    if (this.confettiCanvas) {
      this.confettiCanvas.remove();
      this.confettiCanvas = null;
    }
  }

  /**
   * Compose the comparison canvas(es) into a shareable PNG (with a
   * GeoDoodle header, score/rank hero, and a www.geodoodle.com footer so
   * the image itself brings viewers back to the site) and share/download it.
   */
  async shareResult(regionId, regionNameUpper, regionNameDisplay, scoreEntries, primaryScore, isDaily) {
    const canvases = this.renderedCanvases.filter(Boolean);
    if (canvases.length === 0) return;

    const lang = getLanguage();
    const night = this.app.gameState.getTheme() === 'night';
    const bg = night ? '#18181B' : '#F9F8F6';
    const ink = night ? '#FAFAFA' : '#1C1C1E';
    const inkSoft = night ? '#A1A1AA' : '#6B7280';

    const pad = 24;
    const headerH = 40;
    const dailyH = isDaily ? 28 : 0;
    const heroH = 68;
    const footerH = 48;
    const canvasesH = Math.max(...canvases.map(c => c.height));

    // Real x-offset of each comparison canvas, computed once and reused for
    // both the hero score columns above and the drawImage placement below,
    // so labels stay aligned with the canvas they describe.
    const canvasXOffsets = [];
    {
      let cx = pad;
      for (const c of canvases) {
        canvasXOffsets.push(cx);
        cx += c.width + pad;
      }
    }

    const out = document.createElement('canvas');
    out.width = canvases.reduce((sum, c) => sum + c.width, 0) + pad * (canvases.length + 1);
    out.height = pad + headerH + dailyH + heroH + pad + canvasesH + pad + footerH;
    const ctx = out.getContext('2d');

    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, out.width, out.height);

    let y = pad;

    // Header: GeoDoodle wordmark (fixed size) + region name (shrinks, then
    // ellipsizes, to fit the remaining width — region names can run long).
    ctx.fillStyle = ink;
    ctx.font = '800 26px Outfit, system-ui, sans-serif';
    ctx.fillText('GeoDoodle', pad, y + 26);
    const wordmarkWidth = ctx.measureText('GeoDoodle').width;
    ctx.fillStyle = inkSoft;
    const headerMaxWidth = out.width - pad - (pad + wordmarkWidth);
    const headerLine = fitText(ctx, ` • ${regionNameUpper}`, 22, 600, headerMaxWidth);
    ctx.fillText(headerLine.text, pad + wordmarkWidth, y + 26);
    y += headerH;

    // Daily Challenge framing
    if (isDaily) {
      const dateStr = new Date().toLocaleDateString(lang === 'tr' ? 'tr-TR' : 'en-US', {
        day: 'numeric', month: 'long', year: 'numeric',
      });
      ctx.font = '700 15px Outfit, system-ui, sans-serif';
      ctx.fillStyle = inkSoft;
      ctx.fillText(`${t('mode_text_daily')} • ${dateStr}`, pad, y + 16);
      y += dailyH;
    }

    // Hero: big score + rank name + badge (one block, or one per player)
    if (scoreEntries.length === 1) {
      const { score } = scoreEntries[0];
      const rankObj = getRank(score);
      const rankName = lang === 'en' ? rankObj.nameEn : rankObj.name;
      ctx.font = '800 44px Outfit, system-ui, sans-serif';
      ctx.fillStyle = ink;
      ctx.fillText(String(score), pad, y + 44);
      const scoreWidth = ctx.measureText(String(score)).width;
      ctx.font = '600 18px Outfit, system-ui, sans-serif';
      ctx.fillStyle = inkSoft;
      ctx.fillText('/100', pad + scoreWidth + 4, y + 44);
      ctx.fillStyle = ink;
      const rankMaxWidth = out.width - pad * 2;
      const rankLine = fitText(ctx, `${rankObj.badge} ${rankName}`, 18, 600, rankMaxWidth);
      ctx.fillText(rankLine.text, pad, y + 66);
    } else {
      // Center each player's column on their actual comparison canvas
      // (not an even out.width split, which drifts off the real canvas
      // positions once canvases aren't identically sized).
      ctx.textAlign = 'center';
      scoreEntries.forEach((entry, i) => {
        const rankObj = getRank(entry.score);
        const rankName = lang === 'en' ? rankObj.nameEn : rankObj.name;
        const colCenter = canvasXOffsets[i] + canvases[i].width / 2;
        const colMaxWidth = canvases[i].width - 16;

        ctx.font = '700 15px Outfit, system-ui, sans-serif';
        ctx.fillStyle = inkSoft;
        ctx.fillText(entry.label, colCenter, y + 16);

        ctx.font = '800 28px Outfit, system-ui, sans-serif';
        ctx.fillStyle = ink;
        ctx.fillText(`${entry.score}/100`, colCenter, y + 44);

        ctx.fillStyle = inkSoft;
        const rankLine = fitText(ctx, `${rankObj.badge} ${rankName}`, 14, 600, colMaxWidth);
        ctx.fillText(rankLine.text, colCenter, y + 64);
      });
      ctx.textAlign = 'left';
    }
    y += heroH + pad;

    // Comparison canvas(es) — reuse the same x-offsets as the hero above
    canvases.forEach((c, i) => ctx.drawImage(c, canvasXOffsets[i], y));
    y += canvasesH + pad;

    // Footer strip — the whole point: make the site URL clearly readable
    ctx.fillStyle = ink;
    ctx.fillRect(0, y, out.width, footerH);
    ctx.fillStyle = bg;
    ctx.font = '700 20px Outfit, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('www.geodoodle.com', out.width / 2, y + footerH / 2);

    const blob = await new Promise(resolve => out.toBlob(resolve, 'image/png'));
    if (!blob) return;

    const file = new File([blob], 'geodoodle.png', { type: 'image/png' });
    const shareText = isDaily
      ? t('share_text_daily', { region: regionNameDisplay, score: primaryScore })
      : t('share_text_normal', { region: regionNameDisplay, score: primaryScore });
    // Deep-links the shared link back into the specific region (or the
    // daily challenge) rather than the home page, tagged for GA4 attribution.
    const shareUrl = isDaily
      ? 'https://www.geodoodle.com/?daily=1&utm_source=share&utm_medium=social'
      : `https://www.geodoodle.com/region/${regionId}/?utm_source=share&utm_medium=social`;

    // Some share targets ignore text/url when files are present, but it's
    // harmless to include — and free traffic when they don't.
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'GeoDoodle', text: shareText, url: shareUrl });
        track('share', { method: 'native', daily: !!isDaily });
      } catch (e) {
        // User cancelled the share sheet (AbortError) or the share otherwise
        // didn't go through — either way, not a real share, so don't count it.
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
    track('share', { method: 'download', daily: !!isDaily });
  }

  async renderComparisonCanvas(container, visualData, theme, region) {
    if (!visualData) return;
    const displayCanvas = document.createElement('canvas');
    const { targetPoly, userPoly, rays } = visualData;

    // Use exact original drawing canvas width to ensure 1:1 sizing
    const maxWidth = visualData.canvasWidth;
    const aspect = visualData.canvasHeight / visualData.canvasWidth;

    // #27: below the mobile breakpoint the drawing canvas this visualData
    // was recorded from now fills most of the screen's height (see
    // .canvas-container's flex-fill rule), so replaying the FULL canvas
    // 1:1 here — much of it empty margin around the actual shape — either
    // pushes SCORE / the rank badge / NEXT below the fold, or (capping
    // display height alone) shrinks the whole thing, target included, into
    // a narrow sliver. Neither is what #27 was about; the result canvas
    // was always a bounded strip with content below it. Instead, crop to
    // a box around just the target ring + the user's own points (+ a
    // margin) and map THAT onto the display canvas with one uniform
    // scale — every draw call below still uses its original visualData
    // coordinates unmodified, so target/user/rays stay in exact relative
    // alignment (a zoom of the same coordinate space, not a different
    // fit); only the crop reframes what's visible. Desktop (>=768px) is
    // untouched — its aspect was never affected by the mobile canvas-fill
    // change, so the old 1:1-with-cap path is kept there rather than
    // risking a look the lead hasn't reviewed.
    const isMobile = window.innerWidth < 768;
    let cropMinX = 0, cropMinY = 0, cropW = visualData.canvasWidth, cropH = visualData.canvasHeight;
    if (isMobile) {
      const pts = [...targetPoly, ...userPoly];
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const p of pts) {
        minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
      }
      if (Number.isFinite(minX)) {
        const rawW = Math.max(1, maxX - minX);
        const rawH = Math.max(1, maxY - minY);
        const marginX = rawW * 0.15;
        const marginY = rawH * 0.15;
        cropMinX = Math.max(0, minX - marginX);
        cropMinY = Math.max(0, minY - marginY);
        cropW = Math.min(visualData.canvasWidth - cropMinX, rawW + marginX * 2);
        cropH = Math.min(visualData.canvasHeight - cropMinY, rawH + marginY * 2);
      }
    }

    const maxDisplayHeight = isMobile ? window.innerHeight * 0.4 : Infinity;
    const availWidth = maxWidth; // container's natural width, unchanged
    const scale = isMobile
      ? Math.min(availWidth / cropW, maxDisplayHeight / cropH)
      : maxWidth / visualData.canvasWidth; // desktop: original 1:1-with-cap behavior
    const displayWidth = isMobile ? cropW * scale : maxWidth;
    const displayHeight = isMobile ? cropH * scale : maxWidth * aspect;

    displayCanvas.width = displayWidth;
    displayCanvas.height = displayHeight;
    displayCanvas.style.width = displayWidth + 'px';
    // 'auto', not a fixed px value: 2-player mode's columns are narrower
    // than `maxWidth` (each recorded from that player's own FULL-width
    // single-player turn, then squeezed side by side by the result
    // screen's own flex row — see renderPlayerHtml's widthStr comment),
    // so `max-width:100%` below often clamps the rendered WIDTH down
    // further than this. `height:auto` lets the browser derive height
    // from the canvas's own intrinsic ratio (its width/height attributes,
    // set right above) whenever that clamp fires, keeping the overlay's
    // aspect ratio correct instead of stretching/squashing it — a fixed
    // px height here doesn't respond to the width clamp at all.
    displayCanvas.style.height = 'auto';
    displayCanvas.style.maxWidth = '100%';
    displayCanvas.style.display = 'block';
    displayCanvas.style.margin = '0 auto';

    // Minimalist styling
    displayCanvas.style.border = '2px solid var(--border-color)';
    displayCanvas.style.background = 'transparent';

    const ctx = displayCanvas.getContext('2d');
    const scaleY = isMobile ? scale : (maxWidth * aspect) / visualData.canvasHeight;
    ctx.scale(scale, scaleY);
    ctx.translate(-cropMinX, -cropMinY);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    // -1. Neighbour context (#18c) — shown on the result overlay regardless
    // of whether the round was trace or blind (only live GAMEPLAY hides it
    // in blind mode, to keep "from memory" honest); drawn first, under
    // everything else. Cheap to await here — it's cached after the first
    // build for this region/size/theme.
    if (region) {
      const contextCanvas = await getContextCanvas(region, visualData.canvasWidth, visualData.canvasHeight, theme);
      if (contextCanvas) {
        ctx.drawImage(contextCanvas, 0, 0, visualData.canvasWidth, visualData.canvasHeight);
      }
    }

    // 0. Target region (#18 restyle): islands (decorative, drawn from the
    // SAME projection/fit as the scored main ring so they line up with it —
    // never scored themselves, scoring only ever reads region.path ==
    // rings[0]) plus the main ring (targetPoly), all filled/edged in the
    // SAME Google-Maps-"selection"-style blue. Using one style for every
    // ring (not just the main one) is what fixes an island like Hokkaido
    // reading as a different, inconsistent grey from the mainland.
    // An island's fit is anchored to the main ring alone (see the doc
    // comment on normalizeRingsToCanvasPoints), so it renders wherever that
    // puts it — mostly or entirely off-canvas for some regions (a southern
    // Greek island, Svalbard, Hawaii). Drawing just the on-screen sliver
    // reads as a rendering glitch, not a recognizable island, so anything
    // less than half-visible is skipped outright rather than drawn cropped.
    const islandRings = region?.rings?.length > 1
      ? normalizeRingsToCanvasPoints(region.rings, visualData.canvasWidth, visualData.canvasHeight, 40)
        .slice(1)
        .filter((ring) => visibleRingFraction(ring, visualData.canvasWidth, visualData.canvasHeight) >= 0.5)
      : [];
    const targetRingsForFill = [targetPoly.map((p) => [p.x, p.y]), ...islandRings];
    const targetStyle = getTargetStyle(theme);
    ctx.fillStyle = targetStyle.fill;
    ctx.strokeStyle = targetStyle.edge;
    ctx.lineWidth = 1.5;
    for (const ring of targetRingsForFill) {
      if (ring.length < 3) continue;
      ctx.beginPath();
      ctx.moveTo(ring[0][0], ring[0][1]);
      for (let i = 1; i < ring.length; i++) ctx.lineTo(ring[i][0], ring[i][1]);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // 1. Draw Target Polygon (Reference) outline on top of the fill, all rings
    ctx.strokeStyle = theme === 'night' ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)';
    ctx.lineWidth = 1.5;
    for (const ring of targetRingsForFill) {
      if (ring.length < 3) continue;
      ctx.beginPath();
      ctx.moveTo(ring[0][0], ring[0][1]);
      for (let i = 1; i < ring.length; i++) ctx.lineTo(ring[i][0], ring[i][1]);
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
