import { describe, it, expect } from 'vitest';
import { easeOutQuad, startCountUp } from './count-up.js';

describe('easeOutQuad', () => {
  it('maps 0 to 0 and 1 to 1', () => {
    expect(easeOutQuad(0)).toBe(0);
    expect(easeOutQuad(1)).toBe(1);
  });

  it('front-loads progress (ease-out: faster start, slower finish)', () => {
    expect(easeOutQuad(0.5)).toBeGreaterThan(0.5);
    expect(easeOutQuad(0.25)).toBeGreaterThan(0.25);
  });

  it('clamps out-of-range input', () => {
    expect(easeOutQuad(-1)).toBe(0);
    expect(easeOutQuad(2)).toBe(1);
  });
});

// A manually-steppable fake standing in for Date.now/requestAnimationFrame,
// so startCountUp can be driven deterministically without a DOM or real timers.
function makeFakeScheduler() {
  let time = 0;
  let pending = null;
  return {
    now: () => time,
    requestFrame: (cb) => { pending = cb; return 1; },
    cancelFrame: () => { pending = null; },
    advance(ms) {
      time += ms;
      const cb = pending;
      pending = null;
      if (cb) cb();
    },
  };
}

describe('startCountUp', () => {
  it('reports 0 on the first frame and reaches target exactly once, calling onDone once', () => {
    const scheduler = makeFakeScheduler();
    const values = [];
    let doneCount = 0;
    startCountUp({
      target: 100,
      duration: 1000,
      onUpdate: (v) => values.push(v),
      onDone: () => { doneCount++; },
      ...scheduler,
    });
    scheduler.advance(0); // run the first scheduled frame

    expect(values).toEqual([0]);
    expect(doneCount).toBe(0);

    scheduler.advance(500);
    expect(values.at(-1)).toBeGreaterThan(0);
    expect(values.at(-1)).toBeLessThan(100);
    expect(doneCount).toBe(0);

    scheduler.advance(600); // elapsed 1100ms, past duration
    expect(values.at(-1)).toBe(100);
    expect(doneCount).toBe(1);

    scheduler.advance(1000); // nothing left scheduled — no further calls
    expect(values.at(-1)).toBe(100);
    expect(doneCount).toBe(1);
  });

  it('throttles onTick to roughly tickInterval instead of firing every frame', () => {
    const scheduler = makeFakeScheduler();
    let ticks = 0;
    startCountUp({
      target: 100,
      duration: 300,
      tickInterval: 70,
      onTick: () => { ticks++; },
      ...scheduler,
    });
    scheduler.advance(0);

    for (let i = 0; i < 30; i++) scheduler.advance(10); // 30 frames over 300ms
    expect(ticks).toBeGreaterThan(0);
    expect(ticks).toBeLessThan(10); // far fewer ticks than frames
  });

  it('cancel() stops all further onUpdate/onDone calls', () => {
    const scheduler = makeFakeScheduler();
    const values = [];
    const cancel = startCountUp({
      target: 100,
      duration: 1000,
      onUpdate: (v) => values.push(v),
      ...scheduler,
    });
    scheduler.advance(0);
    scheduler.advance(200);
    const countBeforeCancel = values.length;

    cancel();
    scheduler.advance(900);
    expect(values.length).toBe(countBeforeCancel);
  });
});
