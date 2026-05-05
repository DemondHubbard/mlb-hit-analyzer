const express = require('express');
const axios = require('axios');
const serverCache = require('../cache');

const router = express.Router();
const YEAR = new Date().getFullYear();

function parseCSV(text) {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim());
  return lines.slice(1).map(line => {
    const vals = line.split(',').map(v => v.replace(/"/g, '').trim());
    const obj = {};
    headers.forEach((h, i) => { obj[h] = vals[i] ?? ''; });
    return obj;
  });
}

function sf(v) {
  const n = parseFloat(v);
  return isNaN(n) ? null : Math.round(n * 10) / 10;
}

async function fetchCSV(url) {
  const { data } = await axios.get(url, {
    timeout: 25000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      Accept: 'text/csv,text/plain,*/*',
    },
    responseType: 'text',
  });
  return data;
}

async function loadBatterStatcast() {
  const key = `savant_batter_${YEAR}_${new Date().toISOString().slice(0, 10)}`;
  const cached = serverCache.get(key);
  if (cached) return cached;

  const url = `https://baseballsavant.mlb.com/leaderboard/statcast?min=0&position=&team=&type=batter&year=${YEAR}&csv=true`;
  const csv = await fetchCSV(url);
  const rows = parseCSV(csv);

  const lookup = {};
  for (const r of rows) {
    const id = String(r['player_id'] || r['mlbam_id'] || '').trim();
    if (!id) continue;
    lookup[id] = {
      xba:          sf(r['xba']),
      xwoba:        sf(r['xwoba']),
      xslg:         sf(r['xslg']),
      exitVelocity: sf(r['exit_velocity_avg']),
      launchAngle:  sf(r['launch_angle_avg']),
      sweetSpot:    sf(r['sweet_spot_percent']),
      barrelRate:   sf(r['barrel_batted_rate']),
      hardHitRate:  sf(r['hard_hit_percent']),
      kRate:        sf(r['k_percent']),
      bbRate:       sf(r['bb_percent']),
      whiffRate:    sf(r['whiff_percent']),
      pa:           parseInt(r['pa']) || 0,
    };
  }

  serverCache.set(key, lookup, 14 * 3600 * 1000);
  return lookup;
}

async function loadPitcherStatcast() {
  const key = `savant_pitcher_${YEAR}_${new Date().toISOString().slice(0, 10)}`;
  const cached = serverCache.get(key);
  if (cached) return cached;

  const url = `https://baseballsavant.mlb.com/leaderboard/statcast?min=0&position=&team=&type=pitcher&year=${YEAR}&csv=true`;
  const csv = await fetchCSV(url);
  const rows = parseCSV(csv);

  const lookup = {};
  for (const r of rows) {
    const id = String(r['player_id'] || r['mlbam_id'] || '').trim();
    if (!id) continue;
    lookup[id] = {
      xbaAgainst:          sf(r['xba']),
      xwobaAgainst:        sf(r['xwoba']),
      exitVelocityAllowed: sf(r['exit_velocity_avg']),
      barrelRateAllowed:   sf(r['barrel_batted_rate']),
      hardHitRateAllowed:  sf(r['hard_hit_percent']),
      kRate:               sf(r['k_percent']),
      bbRate:              sf(r['bb_percent']),
      whiffRate:           sf(r['whiff_percent']),
      pa:                  parseInt(r['pa']) || 0,
    };
  }

  serverCache.set(key, lookup, 14 * 3600 * 1000);
  return lookup;
}

router.get('/batter/:playerId', async (req, res) => {
  try {
    const all = await loadBatterStatcast();
    const data = all[req.params.playerId];
    res.json(data || { error: 'Not in leaderboard — needs 25+ PA' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/pitcher/:playerId', async (req, res) => {
  try {
    const all = await loadPitcherStatcast();
    const data = all[req.params.playerId];
    res.json(data || { error: 'Not in leaderboard' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
module.exports.loadBatterStatcast = loadBatterStatcast;
module.exports.loadPitcherStatcast = loadPitcherStatcast;
