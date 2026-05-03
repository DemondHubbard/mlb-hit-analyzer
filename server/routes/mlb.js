const express = require('express');
const axios = require('axios');
const serverCache = require('../cache');
const router = express.Router();

const MLB_V1   = 'https://statsapi.mlb.com/api/v1';
const MLB_V1_1 = 'https://statsapi.mlb.com/api/v1.1';

async function mlbGet(baseUrl, url, params = {}) {
  const { data } = await axios.get(`${baseUrl}${url}`, {
    params,
    timeout: 15000,
    headers: { Accept: 'application/json' },
  });
  return data;
}

const handle = (fn) => async (req, res) => {
  try {
    const data = await fn(req);
    res.json(data);
  } catch (err) {
    const status = err.response?.status || 500;
    res.status(status).json({ error: err.response?.data?.message || err.message });
  }
};

// MLB schedule uses Eastern Time for dates — compute ET date on the server
// so cache keys and default dates don't flip at 8 PM ET (midnight UTC).
const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

// Helper: cache-aside wrapper for MLB player data (12h TTL — doesn't change mid-day)
async function cachedMlbGet(cacheKey, fetcher, ttlMs = 12 * 3600 * 1000) {
  const hit = serverCache.get(cacheKey);
  if (hit) return hit;
  const data = await fetcher();
  serverCache.set(cacheKey, data, ttlMs);
  return data;
}

router.get('/schedule', handle((req) =>
  // Schedule cached 30 min (probable pitchers can update)
  cachedMlbGet(
    `mlb_schedule_${req.query.date || today}`,
    () => mlbGet(MLB_V1, '/schedule', { sportId: 1, ...req.query }),
    30 * 60 * 1000
  )
));

router.get('/game/:gamePk/live', handle((req) =>
  // Live feed — never cache (changes every pitch)
  mlbGet(MLB_V1_1, `/game/${req.params.gamePk}/feed/live`)
));

router.get('/teams/:teamId/roster', handle((req) =>
  cachedMlbGet(
    `mlb_roster_${req.params.teamId}_${today}`,
    () => mlbGet(MLB_V1, `/teams/${req.params.teamId}/roster`, req.query)
  )
));

router.get('/people/:playerId', handle((req) =>
  cachedMlbGet(
    `mlb_person_${req.params.playerId}`,
    () => mlbGet(MLB_V1, `/people/${req.params.playerId}`, req.query),
    24 * 3600 * 1000 // player bio doesn't change
  )
));

router.get('/people/:playerId/stats', handle(async (req) => {
  const { season, stats, group } = req.query;
  const cacheKey = `mlb_stats_${req.params.playerId}_${stats}_${group}_${season}_${today}`;
  return cachedMlbGet(
    cacheKey,
    () => mlbGet(MLB_V1, `/people/${req.params.playerId}/stats`, req.query),
    // Game logs cached 2h (update during games); splits cached 6h
    stats === 'gameLog' ? 2 * 3600 * 1000 : 6 * 3600 * 1000
  );
}));

module.exports = router;
