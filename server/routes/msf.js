const express = require('express');
const axios = require('axios');
const serverCache = require('../cache');
const router = express.Router();

const MSF_BASE = 'https://api.mysportsfeeds.com/v2.1/pull/mlb';

function msfAuth(apiKey) {
  const pass = process.env.MSF_PASSWORD || 'MYSPORTSFEEDS';
  return Buffer.from(`${apiKey}:${pass}`).toString('base64');
}

async function msfGet(apiKey, path, params = {}) {
  const { data } = await axios.get(`${MSF_BASE}${path}`, {
    params,
    headers: { Authorization: `Basic ${msfAuth(apiKey)}` },
    timeout: 15000,
  });
  return data;
}

// Derive name slug MSF uses from full name: "Aaron Judge" → "aaron-judge"
function nameSlug(fullName) {
  return (fullName || '')
    .toLowerCase()
    .replace(/[^a-z ]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

function rollingAvg(logs, n) {
  const slice = logs.slice(0, n);
  const h  = slice.reduce((s, g) => s + g.H,  0);
  const ab = slice.reduce((s, g) => s + g.AB, 0);
  return ab > 0 ? { avg: (h / ab).toFixed(3), H: h, AB: ab, games: slice.length } : null;
}

function extractGameLogs(raw) {
  const entries = raw?.gamelogs ?? [];
  return entries.map(e => ({
    date:  e.game?.startTime?.slice(0, 10) || '',
    H:     e.stats?.batting?.hits          ?? e.stats?.Batting?.H   ?? 0,
    AB:    e.stats?.batting?.atBats        ?? e.stats?.Batting?.AB  ?? 0,
    HR:    e.stats?.batting?.homeRuns      ?? e.stats?.Batting?.HR  ?? 0,
    RBI:   e.stats?.batting?.rbi           ?? e.stats?.Batting?.RBI ?? 0,
    K:     e.stats?.batting?.strikeouts    ?? e.stats?.Batting?.K   ?? 0,
    BB:    e.stats?.batting?.walks         ?? e.stats?.Batting?.BB  ?? 0,
  }));
}

function extractProjections(raw, slug) {
  const entries = raw?.dfsEntries ?? raw?.playerDFS ?? [];
  const entry = entries.find(e => {
    const fn = (e.player?.firstName || '').toLowerCase();
    const ln = (e.player?.lastName  || '').toLowerCase();
    return `${fn}-${ln}` === slug || nameSlug(`${fn} ${ln}`) === slug;
  }) ?? entries[0];

  if (!entry) return null;
  const p = entry.projectedStats?.batting ?? entry.projectedStats?.Batting ?? {};
  return {
    projH:   p.projHits      ?? p.projH   ?? null,
    projAB:  p.projAtBats    ?? p.projAB  ?? null,
    projHR:  p.projHomeRuns  ?? p.projHR  ?? null,
    projRBI: p.projRbi       ?? p.projRBI ?? null,
    dkPts:   entry.fantasyPoints?.draftkings ?? null,
    fdPts:   entry.fantasyPoints?.fanduel    ?? null,
  };
}

function extractInjury(raw, slug) {
  const entries = raw?.injuries ?? [];
  const entry = entries.find(e => {
    const fn = (e.player?.firstName || '').toLowerCase();
    const ln = (e.player?.lastName  || '').toLowerCase();
    return `${fn}-${ln}` === slug;
  });
  if (!entry) return null;
  return {
    status:      entry.gameStatus?.injuryStatus ?? entry.injuryStatus ?? null,
    description: entry.description ?? entry.type ?? null,
    isInjured:   entry.gameStatus?.isInjured ?? false,
  };
}

// GET /api/msf/player?name=Aaron+Judge&date=20260502
router.get('/player', async (req, res) => {
  const apiKey = req.headers['x-msf-api-key'] || process.env.MSF_API_KEY;
  if (!apiKey) return res.json({ error: 'MSF_API_KEY not configured', logs: [], projections: null, injury: null });

  const { name, date } = req.query;
  if (!name) return res.status(400).json({ error: 'name query param required' });

  const slug = nameSlug(name);
  const today = date || new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' }).replace(/-/g, '');
  const cacheKey = `msf_player_${slug}_${today}`;

  const cached = serverCache.get(cacheKey);
  if (cached) return res.json(cached);

  const [logsRes, dfsRes, injuryRes] = await Promise.allSettled([
    msfGet(apiKey, '/2026-regular/player_gamelogs.json', { player: slug, limit: 30 }),
    msfGet(apiKey, `/2026-regular/date/${today}/dfs.json`, { player: slug }),
    msfGet(apiKey, '/current_season/injuries.json', { player: slug }),
  ]);

  const rawLogs = logsRes.status === 'fulfilled' ? logsRes.value : null;
  const rawDfs  = dfsRes.status  === 'fulfilled' ? dfsRes.value  : null;
  const rawInj  = injuryRes.status === 'fulfilled' ? injuryRes.value : null;

  const logs = extractGameLogs(rawLogs);
  const result = {
    logs,
    rolling: {
      L7:  rollingAvg(logs, 7),
      L14: rollingAvg(logs, 14),
      L30: rollingAvg(logs, 30),
    },
    projections: extractProjections(rawDfs, slug),
    injury:      extractInjury(rawInj, slug),
    errors: {
      logs:  logsRes.status  === 'rejected' ? logsRes.reason?.message  : null,
      dfs:   dfsRes.status   === 'rejected' ? dfsRes.reason?.message   : null,
      injury: injuryRes.status === 'rejected' ? injuryRes.reason?.message : null,
    },
  };

  // Cache 4 hours (injuries/projections can update during the day)
  serverCache.set(cacheKey, result, 4 * 60 * 60 * 1000);
  res.json(result);
});

// GET /api/msf/lineups?date=20260502  — confirmed starting lineups
router.get('/lineups', async (req, res) => {
  const apiKey = req.headers['x-msf-api-key'] || process.env.MSF_API_KEY;
  if (!apiKey) return res.json({ error: 'MSF_API_KEY not configured', lineups: [] });

  const today = req.query.date || new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' }).replace(/-/g, '');
  const cacheKey = `msf_lineups_${today}`;
  const cached = serverCache.get(cacheKey);
  if (cached) return res.json(cached);

  try {
    const data = await msfGet(apiKey, `/2026-regular/date/${today}/starting_lineups.json`);
    const result = { lineups: data?.teamLineups ?? data?.startingLineups ?? [] };
    serverCache.set(cacheKey, result, 30 * 60 * 1000); // 30 min — lineups post closer to game time
    res.json(result);
  } catch (err) {
    res.json({ error: err.response?.data?.message || err.message, lineups: [] });
  }
});

module.exports = router;
