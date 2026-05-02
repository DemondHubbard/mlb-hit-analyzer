require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.use('/api/mlb', require('./routes/mlb'));
app.use('/api/odds', require('./routes/odds'));
app.use('/api/analyze', require('./routes/analyze'));

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    hasOddsKey: !!(process.env.ODDS_API_KEY),
    hasAnthropicKey: !!(process.env.ANTHROPIC_API_KEY),
    env: process.env.NODE_ENV || 'development',
  });
});

const distPath = path.join(__dirname, '../dist');
const fs = require('fs');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`MLB Hit Analyzer server on port ${PORT} [${process.env.NODE_ENV || 'development'}]`);
});
