const express = require('express');
const axios = require('axios');
const router = express.Router();

const MLB_V1 = 'https://statsapi.mlb.com/api/v1';
const MLB_V1_1 = 'https://statsapi.mlb.com/api/v1.1';

const mlbGet = (baseUrl) => async (url, params = {}) => {
  const { data } = await axios.get(`${baseUrl}${url}`, {
    params,
    timeout: 15000,
    headers: { 'Accept': 'application/json' },
  });
  return data;
};

const v1 = mlbGet(MLB_V1);
const v1_1 = mlbGet(MLB_V1_1);

const handle = (fn) => async (req, res) => {
  try {
    const data = await fn(req);
    res.json(data);
  } catch (err) {
    const status = err.response?.status || 500;
    const message = err.response?.data?.message || err.message || 'MLB API error';
    console.error(`MLB API error [${status}]:`, message);
    res.status(status).json({ error: message });
  }
};

router.get('/schedule', handle((req) =>
  v1('/schedule', { sportId: 1, ...req.query })
));

router.get('/game/:gamePk/live', handle((req) =>
  v1_1(`/game/${req.params.gamePk}/feed/live`)
));

router.get('/teams/:teamId/roster', handle((req) =>
  v1(`/teams/${req.params.teamId}/roster`, req.query)
));

router.get('/people/:playerId', handle((req) =>
  v1(`/people/${req.params.playerId}`, req.query)
));

router.get('/people/:playerId/stats', handle((req) =>
  v1(`/people/${req.params.playerId}/stats`, req.query)
));

module.exports = router;
