import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  initPlaytimeTracker, startCounting, stopCounting, hasFiredPlay60s,
  PLAY_60S_THRESHOLD_MS, __resetForTest,
} from './playtime-tracker.js';

describe('playtime tracker (#30 play_60s)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    __resetForTest();
  });

  afterEach(() => {
    __resetForTest();
    vi.useRealTimers();
  });

  it('does not fire before the threshold', () => {
    const cb = vi.fn();
    initPlaytimeTracker(cb);
    startCounting();
    vi.advanceTimersByTime(PLAY_60S_THRESHOLD_MS - 1);
    expect(cb).not.toHaveBeenCalled();
    expect(hasFiredPlay60s()).toBe(false);
  });

  it('fires exactly once, right at the threshold', () => {
    const cb = vi.fn();
    initPlaytimeTracker(cb);
    startCounting();
    vi.advanceTimersByTime(PLAY_60S_THRESHOLD_MS);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(hasFiredPlay60s()).toBe(true);

    // Further time passing, or more start/stop cycles, must never fire it again.
    stopCounting();
    startCounting();
    vi.advanceTimersByTime(PLAY_60S_THRESHOLD_MS * 2);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('banks elapsed time on stopCounting and resumes from there', () => {
    const cb = vi.fn();
    initPlaytimeTracker(cb);
    startCounting();
    vi.advanceTimersByTime(40000); // 40s counted
    stopCounting();

    // Time passing while NOT counting (e.g. tab hidden, or off the game
    // screen) must not contribute to the 60s total.
    vi.advanceTimersByTime(5 * 60000);
    expect(cb).not.toHaveBeenCalled();

    startCounting();
    vi.advanceTimersByTime(19999); // 40s + 19.999s = 59.999s — not yet
    expect(cb).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1); // crosses 60s
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('stopCounting before the threshold cancels the pending fire', () => {
    const cb = vi.fn();
    initPlaytimeTracker(cb);
    startCounting();
    vi.advanceTimersByTime(30000);
    stopCounting();
    // If the scheduled timeout weren't cancelled, this would fire here.
    vi.advanceTimersByTime(30000);
    expect(cb).not.toHaveBeenCalled();
  });

  it('startCounting while already counting is a no-op (does not reset the schedule)', () => {
    const cb = vi.fn();
    initPlaytimeTracker(cb);
    startCounting();
    vi.advanceTimersByTime(30000);
    startCounting(); // already counting — must not push the deadline back out
    vi.advanceTimersByTime(30000);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('stopCounting when not counting is a harmless no-op', () => {
    expect(() => stopCounting()).not.toThrow();
  });

  it('multiple short segments summing past the threshold still fire exactly once', () => {
    const cb = vi.fn();
    initPlaytimeTracker(cb);
    for (let i = 0; i < 5; i++) {
      startCounting();
      vi.advanceTimersByTime(10000); // 5 x 10s = 50s
      stopCounting();
    }
    expect(cb).not.toHaveBeenCalled();
    startCounting();
    vi.advanceTimersByTime(10000); // final 10s -> 60s total
    expect(cb).toHaveBeenCalledTimes(1);
  });
});
