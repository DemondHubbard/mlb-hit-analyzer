// Use local browser date (ET for DC users) — toISOString() would return UTC and
// flip to tomorrow after 8 PM ET, showing the wrong day's games.
const _d = new Date();
export const today = [
  _d.getFullYear(),
  String(_d.getMonth() + 1).padStart(2, '0'),
  String(_d.getDate()).padStart(2, '0'),
].join('-');

export const GAMES_KEY    = (date)        => `mlb_games_${date}`;
export const PLAYER_KEY   = (id, date)    => `mlb_player_${id}_${date}`;
export const ANALYSIS_KEY = (gamePk, date) => `mlb_analysis_${gamePk}_${date}`;

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
      if (key.startsWith('mlb_') && !key.endsWith(today)) {
        localStorage.removeItem(key);
      }
    }
  } catch {
    // ignore
  }
}
