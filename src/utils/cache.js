// Use local browser date (ET for DC users) — toISOString() would return UTC and
// flip to tomorrow after 8 PM ET, showing the wrong day's games.
const _d = new Date();
export const today = [
  _d.getFullYear(),
  String(_d.getMonth() + 1).padStart(2, '0'),
  String(_d.getDate()).padStart(2, '0'),
].join('-');

// Bump this when data shape changes so stale localStorage entries are wiped
const CACHE_VERSION = 'v4';

export const GAMES_KEY    = (date)         => `mlb_games_${date}_${CACHE_VERSION}`;
export const PLAYER_KEY   = (id, date)     => `mlb_player_${id}_${date}_${CACHE_VERSION}`;
export const ANALYSIS_KEY = (gamePk, date) => `mlb_analysis_${gamePk}_${date}_${CACHE_VERSION}`;

export function loadCache(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveCache(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {
    // Quota exceeded — skip silently
  }
}

export function cleanOldCache() {
  try {
    const keys = Object.keys(localStorage);
    for (const key of keys) {
      // Remove any mlb_ key that isn't today's date AND current version
      if (key.startsWith('mlb_')) {
        const isCurrentDay     = key.includes(today);
        const isCurrentVersion = key.endsWith(CACHE_VERSION);
        if (!isCurrentDay || !isCurrentVersion) {
          localStorage.removeItem(key);
        }
      }
    }
  } catch {
    // ignore
  }
}
