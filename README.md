# MLB Hit Analyzer

MLB hit prop betting analyzer — powered by live MLB Stats API, The Odds API, and Claude AI.

## Features

- **Live schedule** — fetches today's MLB games with probable pitchers
- **Pitcher splits** — BAA, ERA, WHIP, K-rate vs left- and right-handed batters
- **Lineup loading** — pulls confirmed lineups from the live game feed; falls back to active roster if not posted
- **Batter splits** — AVG/OBP/SLG vs LHP and RHP with sample size display
- **Game dots** — visual last-5 / last-3 game log (green = 2+ hits, blue = 1 hit, gray = 0)
- **Live odds** — real-time hit prop odds from The Odds API with implied probability
- **Claude AI analysis** — per-batter hit probability, edge calculation, hot/cold label, key factors
- **Session caching** — games and player data cached in localStorage per day; odds always fresh
- **Analyze all** — sequential Claude analysis for every batter on the active tab

## Stack

| Layer | Tech |
|-------|------|
| Frontend | React 18 + Vite + Tailwind CSS |
| Backend | Node.js + Express |
| AI | Anthropic Claude (`claude-sonnet-4-5`) |
| Odds | The Odds API v4 |
| Stats | MLB Stats API (free, no key) |

## Local Setup

### 1. Clone and install

```bash
git clone https://github.com/YOUR_USERNAME/mlb-hit-analyzer.git
cd mlb-hit-analyzer
npm install
```

### 2. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env`:

```env
ODDS_API_KEY=your_key_from_the-odds-api.com
ANTHROPIC_API_KEY=your_key_from_console.anthropic.com
NODE_ENV=development
```

### 3. Run in development

```bash
npm run dev
```

This starts:
- Express API server on `http://localhost:3001`
- Vite dev server on `http://localhost:5173` (proxies `/api` to Express)

Open `http://localhost:5173` in your browser.

### 4. Build for production (local preview)

```bash
npm run build
NODE_ENV=production npm start
```

Open `http://localhost:3001`.

## API Keys

| Key | Where to get | Required |
|-----|-------------|----------|
| `ODDS_API_KEY` | [the-odds-api.com](https://the-odds-api.com) | For live odds only |
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com) | For AI analysis |

You can also enter keys in the in-app **Settings** modal (gear icon, top right). Keys entered there are stored in `localStorage` and sent as request headers — useful if you're sharing a deployment and want per-user keys.

## Railway Deployment

### 1. Push to GitHub

```bash
git remote add origin https://github.com/YOUR_USERNAME/mlb-hit-analyzer.git
git push -u origin main
```

### 2. Create Railway project

1. Go to [railway.app](https://railway.app) and click **New Project → Deploy from GitHub repo**
2. Select your `mlb-hit-analyzer` repository
3. Railway auto-detects Node.js and uses `railway.json` for build/start commands

### 3. Set environment variables in Railway

In your Railway project → **Variables** tab, add:

| Variable | Value |
|----------|-------|
| `NODE_ENV` | `production` |
| `ODDS_API_KEY` | your key |
| `ANTHROPIC_API_KEY` | your key |

Railway automatically sets `PORT`. Do **not** set it manually.

### 4. Deploy

Railway triggers a deploy on every push to `main`. The build runs:
```
npm ci && npm run build
```
Then starts with:
```
npm start   →   node server/index.js
```

The Express server serves the React static build from `dist/` in production.

### Healthcheck

`GET /api/health` returns `{ status: "ok", hasOddsKey: true, hasAnthropicKey: true }` — Railway uses this to verify the deployment is live.

## Project Structure

```
mlb-hit-analyzer/
├── server/
│   ├── index.js              # Express server + static file serving
│   └── routes/
│       ├── mlb.js            # MLB Stats API proxy
│       ├── odds.js           # The Odds API proxy
│       └── analyze.js        # Claude AI analysis endpoint
├── src/
│   ├── App.jsx               # Root component + view routing
│   ├── utils/
│   │   ├── cache.js          # localStorage caching helpers
│   │   └── helpers.js        # Data parsing, formatting, API fetch
│   └── components/
│       ├── GameAnalysis.jsx  # Main game analysis view (lineup loading, tabs)
│       ├── BatterCard.jsx    # Per-batter card with analysis
│       ├── PitcherPanel.jsx  # Pitcher splits display
│       ├── ProbabilityMeter.jsx  # SVG circular probability display
│       ├── SummaryBar.jsx    # Post-analysis summary stats
│       ├── SettingsModal.jsx # API key management
│       └── ...
├── .env.example
├── railway.json
├── vite.config.js
└── package.json
```

## Caching Behavior

- **Games list**: cached under `mlb_games_{YYYY-MM-DD}` — fetched once per day
- **Player data** (info, splits, game log): cached under `mlb_player_{id}_{YYYY-MM-DD}` — fetched once per day per player
- **Odds**: never cached — always a fresh fetch when loading a game
- **Stale cache cleanup**: on every app load, all `mlb_*` keys from previous dates are deleted

## Notes

- All MLB Stats API and Odds API calls are proxied through Express — no API keys are exposed to the browser
- If a lineup isn't posted yet, the app falls back to the active roster with a notice
- Batter cards are wrapped in error boundaries so one failed player fetch doesn't break the page
