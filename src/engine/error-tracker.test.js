import { describe, it, expect, vi } from 'vitest';
import { createErrorTracker } from './error-tracker.js';

describe('createErrorTracker', () => {
  it('reports a single error with kind/message/source', () => {
    const track = vi.fn();
    const report = createErrorTracker(track);

    report('error', 'Boom', 'app.js:12:3');

    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith('js_error', { kind: 'error', message: 'Boom', source: 'app.js:12:3' });
  });

  it('truncates the message to 100 characters', () => {
    const track = vi.fn();
    const report = createErrorTracker(track);
    const longMessage = 'x'.repeat(500);

    report('error', longMessage);

    expect(track.mock.calls[0][1].message).toHaveLength(100);
  });

  it('dedupes repeats of the same kind+message+source', () => {
    const track = vi.fn();
    const report = createErrorTracker(track);

    report('error', 'Boom', 'app.js:1:1');
    report('error', 'Boom', 'app.js:1:1');
    report('error', 'Boom', 'app.js:1:1');

    expect(track).toHaveBeenCalledTimes(1);
  });

  it('treats a different source or kind as a distinct error', () => {
    const track = vi.fn();
    const report = createErrorTracker(track);

    report('error', 'Boom', 'app.js:1:1');
    report('error', 'Boom', 'app.js:2:2');
    report('rejection', 'Boom', 'app.js:1:1');

    expect(track).toHaveBeenCalledTimes(3);
  });

  it('caps total reports at maxReports (default 5) even for distinct errors', () => {
    const track = vi.fn();
    const report = createErrorTracker(track);

    for (let i = 0; i < 10; i++) {
      report('error', `Error ${i}`);
    }

    expect(track).toHaveBeenCalledTimes(5);
  });

  it('respects a custom maxReports', () => {
    const track = vi.fn();
    const report = createErrorTracker(track, { maxReports: 2 });

    report('error', 'One');
    report('error', 'Two');
    report('error', 'Three');

    expect(track).toHaveBeenCalledTimes(2);
  });

  it('never throws even if track() throws', () => {
    const track = vi.fn(() => { throw new Error('gtag exploded'); });
    const report = createErrorTracker(track);

    expect(() => report('error', 'Boom')).not.toThrow();
  });

  it('handles a nullish message without throwing', () => {
    const track = vi.fn();
    const report = createErrorTracker(track);

    expect(() => report('rejection', undefined)).not.toThrow();
    expect(track).toHaveBeenCalledWith('js_error', { kind: 'rejection', message: '', source: '' });
  });
});
