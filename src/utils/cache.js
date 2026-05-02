export const today = new Date().toISOString().split('T')[0];

export const GAMES_KEY = (date) => `mlb_games_${date}`;
export const PLAYER_KEY = (id, date) => `mlb_player_${id}_${date}`;

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
