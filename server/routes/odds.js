const express = require('express');
const axios = require('axios');
const router = express.Router();

const ODDS_BASE = 'https://api.the-odds-api.com/v4';

function normalizeName(name) {
  return (name || '').toLowerCase().replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();
}

function buildLookup(gamesArray) {
  const lookup = {};
  for (const game of (gamesArray || [])) {
    for (const bookmaker of (game.bookmakers || [])) {
      for (const market of (bookmaker.markets || [])) {
        if (market.key !== 'batter_hits') continue;
        for (const outcome of (market.outcomes || [])) {
          if (outcome.description !== 'Over') continue;
          const key = normalizeName(outcome.name);
          if (!lookup[key]) {
            lookup[key] = {
              playerName: outcome.name,
              price: outcome.price,
              point: outcome.point,
              bookmaker: bookmaker.title,
            };
          }
        }
      }
    }
  }
  return lookup;
}

async function fetchViaBulk(apiKey) {
  const { data } = await axios.get(`${ODDS_BASE}/sports/baseball_mlb/odds`, {
    params: { apiKey, regions: 'us', markets: 'batter_hits', oddsFormat: 'american' },
    timeout: 15000,
  });
  return buildLookup(data);
}

async function fetchViaEvents(apiKey) {
  const { data: events } = await axios.get(`${ODDS_BASE}/sports/baseball_mlb/events`, {
    params: { apiKey, dateFormat: 'iso' },
    timeout: 15000,
  });

  const lookup = {};
  await Promise.all(
    (events || []).slice(0, 15).map(async (event) => {
      try {
        const { data } = await axios.get(
          `${ODDS_BASE}/sports/baseball_mlb/events/${event.id}/odds`,
          {
            params: { apiKey, regions: 'us', markets: 'batter_hits', oddsFormat: 'american' },
            timeout: 15000,
          }
        );
        Object.assign(lookup, buildLookup([data]));
      } catch {
        // skip events where props aren't posted yet
      }
    })
  );
  return lookup;
}

router.get('/', async (req, res) => {
  const apiKey = req.headers['x-odds-api-key'] || process.env.ODDS_API_KEY;
  if (!apiKey) {
    return res.status(400).json({ error: 'Odds API key not configured.' });
  }

  try {
    // Try bulk endpoint first (works on some plans)
    const lookup = await fetchViaBulk(apiKey).catch(async (err) => {
      if (err.response?.status === 422) {
        // batter_hits not supported on bulk endpoint — use per-event endpoint
        console.log('Odds bulk endpoint returned 422, falling back to event endpoint');
        return fetchViaEvents(apiKey);
      }
      throw err;
    });

    res.json({ lookup });
  } catch (err) {
    const status = err.response?.status || 500;
    const msg = err.response?.data?.message || err.message;
    console.error(`Odds API error [${status}]:`, msg);
    // Return empty odds gracefully so the app still works without odds
    res.json({ lookup: {}, warning: msg });
  }
});

module.exports = router;
