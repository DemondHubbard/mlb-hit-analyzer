const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const router = express.Router();

router.post('/', async (req, res) => {
  const apiKey = req.headers['x-anthropic-api-key'] || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(400).json({ error: 'Anthropic API key not configured. Add ANTHROPIC_API_KEY to .env or enter it in Settings.' });
  }

  const { batter, pitcher, odds } = req.body;
  if (!batter || !pitcher) {
    return res.status(400).json({ error: 'Missing batter or pitcher data' });
  }

  const client = new Anthropic({ apiKey });

  const pitcherHand = pitcher.hand || 'R';
  const vsKey = pitcherHand === 'L' ? 'vsLHP' : 'vsRHP';
  const relevantSplit = batter.splits?.[vsKey] || {};

  const batterHand = batter.batSide === 'L' ? 'L' : (batter.batSide === 'S' ? 'S' : 'R');
  const pitcherVsKey = batterHand === 'L' ? 'vsLHB' : 'vsRHB';
  const pitcherVsSplit = pitcher.splits?.[pitcherVsKey] || {};

  const gameLog = batter.gameLog?.slice(0, 10) || [];
  const last3 = gameLog.slice(0, 3);
  const last5 = gameLog.slice(0, 5);
  const l3Hits = last3.reduce((s, g) => s + (g.hits || 0), 0);
  const l3AB = last3.reduce((s, g) => s + (g.atBats || 0), 0);
  const l5Hits = last5.reduce((s, g) => s + (g.hits || 0), 0);
  const l5AB = last5.reduce((s, g) => s + (g.atBats || 0), 0);
  const l3WithHit = last3.filter(g => g.hits > 0).length;
  const l5WithHit = last5.filter(g => g.hits > 0).length;

  const pitcherLog = pitcher.gameLog?.slice(0, 3) || [];

  let oddsText = 'No odds available';
  if (odds?.price != null) {
    const p = odds.price;
    const implied = p > 0 ? (100 / (p + 100)) * 100 : (Math.abs(p) / (Math.abs(p) + 100)) * 100;
    oddsText = `${p > 0 ? '+' : ''}${p} (implied probability: ${implied.toFixed(1)}%)`;
  }

  const prompt = `You are an expert MLB prop betting analyst. Calculate the probability of this batter recording AT LEAST 1 hit.

BATTER: ${batter.name} (Bats: ${batterHand}, Position: ${batter.position || 'UT'})
vs LHP 2026: AVG ${batter.splits?.vsLHP?.avg || 'N/A'} | OBP ${batter.splits?.vsLHP?.obp || 'N/A'} | SLG ${batter.splits?.vsLHP?.slg || 'N/A'} | ${batter.splits?.vsLHP?.atBats || 0} AB | ${batter.splits?.vsLHP?.strikeOuts || 0} K
vs RHP 2026: AVG ${batter.splits?.vsRHP?.avg || 'N/A'} | OBP ${batter.splits?.vsRHP?.obp || 'N/A'} | SLG ${batter.splits?.vsRHP?.slg || 'N/A'} | ${batter.splits?.vsRHP?.atBats || 0} AB | ${batter.splits?.vsRHP?.strikeOuts || 0} K
Today faces: ${pitcherHand}HP — relevant split: AVG ${relevantSplit.avg || 'N/A'} OBP ${relevantSplit.obp || 'N/A'} in ${relevantSplit.atBats || 0} AB
Last 3 games: ${l3Hits}H in ${l3AB}AB, had a hit in ${l3WithHit}/3 games
Last 5 games: ${l5Hits}H in ${l5AB}AB, had a hit in ${l5WithHit}/5 games
Game log (most recent first): ${gameLog.map(g => `${g.date}: ${g.hits}/${g.atBats}/${g.strikeOuts}K`).join(', ')}

OPPOSING PITCHER: ${pitcher.name} (Throws: ${pitcherHand})
vs LHB: BAA ${pitcher.splits?.vsLHB?.avg || 'N/A'} | ERA ${pitcher.splits?.vsLHB?.era || 'N/A'} | WHIP ${pitcher.splits?.vsLHB?.whip || 'N/A'} | ${pitcher.splits?.vsLHB?.strikeOuts || 0} K in ${pitcher.splits?.vsLHB?.battersFaced || 0} BF
vs RHB: BAA ${pitcher.splits?.vsRHB?.avg || 'N/A'} | ERA ${pitcher.splits?.vsRHB?.era || 'N/A'} | WHIP ${pitcher.splits?.vsRHB?.whip || 'N/A'} | ${pitcher.splits?.vsRHB?.strikeOuts || 0} K in ${pitcher.splits?.vsRHB?.battersFaced || 0} BF
Pitcher vs this batter's handedness (${batterHand}HB): BAA ${pitcherVsSplit.avg || 'N/A'} WHIP ${pitcherVsSplit.whip || 'N/A'}
Pitcher last 3 starts: ${pitcherLog.map(g => `${g.date}: ${g.inningsPitched}IP ${g.earnedRuns}ER ${g.hits}H`).join(' | ')}

BETTING ODDS: ${oddsText}

CONTEXT: MLB baseline is ~65-70% per game. Weight the matchup-specific split heavily. Note sample size — splits under 50 AB are unreliable. A hot streak (hit in 4+ of last 5) adds ~5%. A cold streak (0 hits in last 3) subtracts ~5%.

Return ONLY valid JSON, no markdown or explanation:
{
  "hitProbability": <integer 0-100>,
  "confidence": "low" | "medium" | "high",
  "recommendation": "strong_pick" | "good_value" | "neutral" | "lean_avoid" | "avoid",
  "hotCold": "hot" | "warm" | "neutral" | "cold" | "ice_cold",
  "edge": <float — positive means value vs implied odds, null if no odds provided>,
  "reasoning": "<2-3 sentence analysis>",
  "keyFactors": ["<factor 1>", "<factor 2>", "<factor 3>"]
}`;

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = message.content[0]?.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Claude returned non-JSON response');
    const result = JSON.parse(jsonMatch[0]);
    res.json(result);
  } catch (err) {
    console.error('Analyze error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
