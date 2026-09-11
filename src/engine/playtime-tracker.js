/**
 * Cumulative "time spent on the game screen" tracker for the `play_60s` GA4
 * event (#30) — our equivalent of CrazyGames' own conversion definition
 * ("played at least one minute after starting the game"). Fires the
 * registered callback exactly ONCE per page load, the moment cumulative
 * counted time reaches THRESHOLD_MS — never while the tab is hidden or the
 * player is off the game screen (callers gate that by calling
 * startCounting()/stopCounting() around those transitions; this module
 * itself has no opinion on what "the game screen" or "hidden" mean).
 *
 * Scheduled via a single setTimeout for the exact remaining time, not a
 * polling interval — cheap, and fires at the right moment rather than up
 * to a poll-interval late.
 */

export const PLAY_60S_THRESHOLD_MS = 60000;

let accumulatedMs = 0;
let segmentStartedAt = null; // Date.now() when the current counting segment began, or null
let timeoutId = null;
let fired = false;
let onThreshold = null;

/** Registers the callback fired once cumulative counted time hits the threshold. */
export function initPlaytimeTracker(callback) {
  onThreshold = callback;
}

/** Starts (or resumes) counting. A no-op if already counting or already fired. */
export function startCounting() {
  if (fired || segmentStartedAt != null) return;
  segmentStartedAt = Date.now();
  const remaining = PLAY_60S_THRESHOLD_MS - accumulatedMs;
  timeoutId = setTimeout(() => {
    fired = true;
    segmentStartedAt = null;
    timeoutId = null;
    if (onThreshold) {
      try { onThreshold(); } catch (e) { /* a bad listener must not break the tracker */ }
    }
  }, Math.max(0, remaining));
}

/** Pauses counting, banking the elapsed time so a later startCounting() resumes from where it left off. A no-op if not currently counting. */
export function stopCounting() {
  if (segmentStartedAt == null) return;
  if (timeoutId != null) {
    clearTimeout(timeoutId);
    timeoutId = null;
  }
  accumulatedMs += Date.now() - segmentStartedAt;
  segmentStartedAt = null;
}

/** Whether the threshold has already fired this page load. */
export function hasFiredPlay60s() {
  return fired;
}

/** Test-only: resets all module state between test cases. Not used by app code. */
export function __resetForTest() {
  if (timeoutId != null) clearTimeout(timeoutId);
  accumulatedMs = 0;
  segmentStartedAt = null;
  timeoutId = null;
  fired = false;
  onThreshold = null;
}
