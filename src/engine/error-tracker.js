/**
 * Session-scoped `js_error` reporter (issue #14) — dedupes repeats of the
 * same (kind, message, source) and caps the total number of reports per
 * session, so a tight error/rejection loop can't spam analytics. Pure state
 * container: callers own the actual `window` listeners and just call the
 * returned `report()` function from them.
 *
 * `track` is injected (rather than importing analytics.js directly) so this
 * stays DOM/analytics-free and easy to unit test.
 */
export function createErrorTracker(track, { maxReports = 5 } = {}) {
  const seen = new Set();
  let count = 0;

  return function report(kind, message, source = '') {
    try {
      if (count >= maxReports) return;

      const trimmed = String(message ?? '').slice(0, 100);
      const key = `${kind}|${trimmed}|${source}`;
      if (seen.has(key)) return;

      seen.add(key);
      count++;
      track('js_error', { kind, message: trimmed, source });
    } catch (e) {
      // Error tracking must never itself throw, or break the app it's
      // supposed to be reporting on.
    }
  };
}
