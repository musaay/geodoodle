import { describe, it, expect } from 'vitest';
import { computeMoreRowState } from './result-more-row.js';

const notStarted = { playedCount: 0, isComplete: false };
const notComplete = { playedCount: 1, isComplete: false };
const complete = { playedCount: 3, isComplete: true };

describe('computeMoreRowState', () => {
  it('hides the whole row in 2-player mode, regardless of anything else', () => {
    expect(computeMoreRowState({
      isMultiplayer: true, chainOutcome: null, dailyOutcome: null,
      dailyProgress: notComplete, bestChain: null,
    })).toBeNull();
  });

  it('hides the whole row during an active chain round (primary button already drives that flow)', () => {
    expect(computeMoreRowState({
      isMultiplayer: false, chainOutcome: { ended: false }, dailyOutcome: null,
      dailyProgress: notComplete, bestChain: null,
    })).toBeNull();
  });

  it('hides the whole row during an active daily round', () => {
    expect(computeMoreRowState({
      isMultiplayer: false, chainOutcome: null, dailyOutcome: { progress: notComplete },
      dailyProgress: notComplete, bestChain: null,
    })).toBeNull();
  });

  it('hides the whole row during an active Sefer/Run round (#30) — more-chain/more-daily never commit the run\'s score, and more-chain additionally abandons the run outright', () => {
    expect(computeMoreRowState({
      isMultiplayer: false, chainOutcome: null, dailyOutcome: null,
      runOutcome: { index: 2, total: 140, isComplete: false },
      dailyProgress: notComplete, bestChain: null,
    })).toBeNull();
  });

  it('shows the chain card (with no best-chain yet) and the daily card on a normal, single-player round', () => {
    const state = computeMoreRowState({
      isMultiplayer: false, chainOutcome: null, dailyOutcome: null,
      dailyProgress: notComplete, bestChain: null,
    });
    expect(state).toEqual({
      showChain: true, bestChain: null, showDaily: true, dailyStarted: true, dailyPlayedCount: 1,
    });
  });

  it('flags the daily card as not-yet-started when nothing has been played today (picks the invitation wording, not "0/3 done")', () => {
    const state = computeMoreRowState({
      isMultiplayer: false, chainOutcome: null, dailyOutcome: null,
      dailyProgress: notStarted, bestChain: null,
    });
    expect(state.showDaily).toBe(true);
    expect(state.dailyStarted).toBe(false);
    expect(state.dailyPlayedCount).toBe(0);
  });

  it('carries the best chain through when one exists', () => {
    const bestChain = { links: 7, total: 512 };
    const state = computeMoreRowState({
      isMultiplayer: false, chainOutcome: null, dailyOutcome: null,
      dailyProgress: notComplete, bestChain,
    });
    expect(state.bestChain).toBe(bestChain);
  });

  it('hides only the daily card once today\'s set is complete, while the chain card still shows', () => {
    const state = computeMoreRowState({
      isMultiplayer: false, chainOutcome: null, dailyOutcome: null,
      dailyProgress: complete, bestChain: null,
    });
    expect(state.showChain).toBe(true);
    expect(state.showDaily).toBe(false);
  });
});
