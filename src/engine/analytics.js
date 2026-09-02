/**
 * GA4 event tracking — a thin wrapper around window.gtag.
 * No-ops silently when gtag isn't present (adblock, offline, gtag script
 * failed to load) — must never throw and never block gameplay.
 */

const platform = import.meta.env.VITE_PORTAL === '1' ? 'portal' : 'web';

/** Fires a GA4 event via window.gtag, tagging every event with `platform`. */
export function track(eventName, params = {}) {
  try {
    if (typeof window === 'undefined' || typeof window.gtag !== 'function') return;
    window.gtag('event', eventName, { platform, ...params });
  } catch (e) {
    // Analytics must never break gameplay
  }
}
