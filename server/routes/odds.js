const express = require('express');
const axios = require('axios');
const router = express.Router();

const ODDS_BASE = 'https://api.the-odds-api.com/v4';

router.get('/', async (req, res) => {
  const apiKey = req.headers['x-odds-api-key'] || process.env.ODDS_API_KEY;

  if (!apiKey) {
    return res.status(400).json({ error: 'Odds API key not configured. Add ODDS_API_KEY to .env or enter it in Settings.' });
  }

  try {
    const { data } = await axios.get(`${ODDS_BASE}/sports/baseball_mlb/odds`, {
      params: {
        apiKey,
        regions: 'us',
        markets: 'batter_hits',
        oddsFormat: 'american',
      },
      timeout: 15000,
    });

    // Build a flat lookup: normalizedPlayerName -> best odds (first bookmaker's Over line)
    const lookup = {};
    for (const game of (data || [])) {
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

    res.json({ lookup });
  } catch (err) {
    const status = err.response?.status || 500;
    const msg = err.response?.data?.message || err.message;
    console.error(`Odds API error [${status}]:`, msg);
    res.status(status).json({ error: msg });
  }
});

function normalizeName(name) {
  return (name || '').toLowerCase().replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();
}

module.exports = router;
