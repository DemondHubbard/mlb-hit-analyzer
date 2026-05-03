const fs = require('fs');
const path = require('path');

// Railway volume should be mounted at /app/data — set CACHE_DIR env var to that path.
// Falls back to a local .cache dir for development.
const CACHE_DIR = process.env.CACHE_DIR
  ? path.join(process.env.CACHE_DIR, 'api-cache')
  : path.join(__dirname, '../.cache');

try {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
} catch {}

function keyToPath(key) {
  const safe = key.replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.join(CACHE_DIR, `${safe}.json`);
}

function get(key) {
  try {
    const file = keyToPath(key);
    if (!fs.existsSync(file)) return null;
    const { data, expires } = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (Date.now() > expires) {
      fs.unlinkSync(file);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

function set(key, data, ttlMs = 3_600_000) {
  try {
    fs.writeFileSync(keyToPath(key), JSON.stringify({ data, expires: Date.now() + ttlMs }));
  } catch {}
}

// Purge entries older than today — called once at startup
function purgeStale() {
  try {
    const now = Date.now();
    for (const f of fs.readdirSync(CACHE_DIR)) {
      try {
        const full = path.join(CACHE_DIR, f);
        const { expires } = JSON.parse(fs.readFileSync(full, 'utf8'));
        if (now > expires) fs.unlinkSync(full);
      } catch {
        // corrupt entry — remove it
        try { fs.unlinkSync(path.join(CACHE_DIR, f)); } catch {}
      }
    }
  } catch {}
}

purgeStale();

module.exports = { get, set };
