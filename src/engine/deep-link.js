/**
 * Parses a startup deep link from `location.search`. Pure, DOM-free.
 *
 * - `?region=<id>&mode=<trace|blind>` -> { type: 'region', regionId, mode }
 *   (mode defaults to 'trace' when missing or not 'trace'/'blind')
 * - `?daily=1` -> { type: 'daily' }
 * - anything else -> null
 *
 * `region` takes priority over `daily` if both are somehow present.
 */
export function parseDeepLink(search) {
  const params = new URLSearchParams(search);

  const regionId = params.get('region');
  if (regionId) {
    const mode = params.get('mode') === 'blind' ? 'blind' : 'trace';
    return { type: 'region', regionId, mode };
  }

  if (params.get('daily') === '1') {
    return { type: 'daily' };
  }

  return null;
}
