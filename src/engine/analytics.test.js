import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { track } from './analytics.js';

describe('analytics track()', () => {
  const originalGtag = globalThis.window?.gtag;

  beforeEach(() => {
    globalThis.window = globalThis.window || {};
    delete globalThis.window.gtag;
  });

  afterEach(() => {
    if (originalGtag) globalThis.window.gtag = originalGtag;
    else delete globalThis.window?.gtag;
  });

  it('is a silent no-op when window.gtag is missing', () => {
    expect(() => track('game_start', { mode: 'trace' })).not.toThrow();
  });

  it('is a silent no-op when gtag throws', () => {
    globalThis.window.gtag = () => { throw new Error('blocked'); };
    expect(() => track('game_start', { mode: 'trace' })).not.toThrow();
  });

  it('calls gtag with the event name, params, and a platform tag when present', () => {
    const calls = [];
    globalThis.window.gtag = (...args) => calls.push(args);

    track('game_submit', { mode: 'blind', score: 90 });

    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toBe('event');
    expect(calls[0][1]).toBe('game_submit');
    expect(calls[0][2]).toMatchObject({ mode: 'blind', score: 90 });
    expect(calls[0][2].platform).toBe('web');
  });
});
