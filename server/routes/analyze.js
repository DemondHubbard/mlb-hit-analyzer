const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const router = express.Router();

function splitLine(splits, hand) {
  if (!splits) return 'N/A';
  const s = splits[hand === 'L' ? 'vsLHP' : 'vsRHP'] || splits[hand === 'L' ? 'vsLHB' : 'vsRHB'];
  if (!s) return 'N/A';
  if (s.era !== undefined) {
    // pitcher split
    return `BAA ${s.avg} | ERA ${s.era} | WHIP ${s.whip} | ${s.strikeOuts}K/${s.battersFaced}BF`;
  }
  // batter split
  return `AVG ${s.avg} | OBP ${s.obp} | SLG ${s.slg} | ${s.atBats}AB`;
}

function batterHistoryBlock(batter, vsKey) {
  const lines = [];
  for (const [year, field] of [['2025', 'splits2025'], ['2024', 'splits2024']]) {
    const s = batter[field];
    if (!s) continue;
    const split = s[vsKey];
    if (split?.atBats > 0) {
      lines.push(`  ${year} vs same hand: AVG ${split.avg} | OBP ${split.obp} | SLG ${split.slg} | ${split.atBats}AB`);
    }
    // overall (LHP+RHP combined) if available
    const other = s[vsKey === 'vsLHP' ? 'vsRHP' : 'vsLHP'];
    if (other?.atBats > 0) {
      lines.push(`  ${year} vs opp hand:  AVG ${other.avg} | OBP ${other.obp} | SLG ${other.slg} | ${other.atBats}AB`);
    }
  }
  return lines.length ? lines.join('\n') : '  No historical data available';
}

function pitcherHistoryBlock(pitcher, vsKey) {
  const s = pitcher.splits2025?.[vsKey];
  if (!s) return '  No 2025 data available';
  return `  2025 vs same side: BAA ${s.avg} | ERA ${s.era} | WHIP ${s.whip} | ${s.strikeOuts}K/${s.battersFaced}BF`;
}

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
  const batterHand = batter.batSide === 'L' ? 'L' : (batter.batSide === 'S' ? 'S' : 'R');
  const vsKey = pitcherHand === 'L' ? 'vsLHP' : 'vsRHP';
  const pitcherVsKey = batterHand === 'L' ? 'vsLHB' : 'vsRHB';

  const relevantSplit = batter.splits?.[vsKey] || {};
  const pitcherVsSplit = pitcher.splits?.[pitcherVsKey] || {};

  const gameLog = batter.gameLog?.slice(0, 10) || [];
  const last3 = gameLog.slice(0, 3);
  const last5 = gameLog.slice(0, 5);
  const l3Hits    = last3.reduce((s, g) => s + (g.hits || 0), 0);
  const l3AB      = last3.reduce((s, g) => s + (g.atBats || 0), 0);
  const l5Hits    = last5.reduce((s, g) => s + (g.hits || 0), 0);
  const l5AB      = last5.reduce((s, g) => s + (g.atBats || 0), 0);
  const l3WithHit = last3.filter(g => g.hits > 0).length;
  const l5WithHit = last5.filter(g => g.hits > 0).length;

  const pitcherLog = pitcher.gameLog?.slice(0, 3) || [];

  let oddsText = 'No odds available';
  if (odds?.price != null) {
    const p = odds.price;
    const implied = p > 0 ? (100 / (p + 100)) * 100 : (Math.abs(p) / (Math.abs(p) + 100)) * 100;
    oddsText = `${p > 0 ? '+' : ''}${p} (implied probability: ${implied.toFixed(1)}%)`;
  }

  const smallSample2026 = (relevantSplit.atBats || 0) < 40;

  // MySportsFeed data
  const msf = batter.msf || null;
  const msfBlock = (() => {
    if (!msf) return '  MySportsFeed data not available';
    const lines = [];
    if (msf.injury?.status) {
      lines.push(`  ⚠ INJURY: ${msf.injury.status} — ${msf.injury.description || 'details unknown'}`);
    }
    const r = msf.rolling || {};
    if (r.L7)  lines.push(`  L7  rolling AVG: ${r.L7.avg}  (${r.L7.H}H / ${r.L7.AB}AB in ${r.L7.games} games)`);
    if (r.L14) lines.push(`  L14 rolling AVG: ${r.L14.avg} (${r.L14.H}H / ${r.L14.AB}AB in ${r.L14.games} games)`);
    if (r.L30) lines.push(`  L30 rolling AVG: ${r.L30.avg} (${r.L30.H}H / ${r.L30.AB}AB in ${r.L30.games} games)`);
    const p = msf.projections;
    if (p?.projH != null) lines.push(`  Today's projection: ${p.projH.toFixed(2)}H in ${p.projAB?.toFixed(2)}AB (${p.projHR?.toFixed(2)}HR projected)`);
    return lines.length ? lines.join('\n') : '  No MSF data returned';
  })();

  const prompt = `You are an expert MLB prop betting analyst. Calculate the probability of this batter recording AT LEAST 1 hit.

━━━ BATTER: ${batter.name} (Bats: ${batterHand}, Position: ${batter.position || 'UT'}) ━━━

2026 SEASON SPLITS (current):
  vs LHP: AVG ${batter.splits?.vsLHP?.avg || 'N/A'} | OBP ${batter.splits?.vsLHP?.obp || 'N/A'} | SLG ${batter.splits?.vsLHP?.slg || 'N/A'} | ${batter.splits?.vsLHP?.atBats || 0} AB
  vs RHP: AVG ${batter.splits?.vsRHP?.avg || 'N/A'} | OBP ${batter.splits?.vsRHP?.obp || 'N/A'} | SLG ${batter.splits?.vsRHP?.slg || 'N/A'} | ${batter.splits?.vsRHP?.atBats || 0} AB
  Today faces: ${pitcherHand}HP — relevant 2026 split: AVG ${relevantSplit.avg || 'N/A'} OBP ${relevantSplit.obp || 'N/A'} in ${relevantSplit.atBats || 0} AB${smallSample2026 ? ' ⚠ SMALL SAMPLE — weight historical splits more heavily' : ''}

HISTORICAL SPLITS (2025–2024 context):
${batterHistoryBlock(batter, vsKey)}

RECENT FORM:
  Last 3 games: ${l3Hits}H in ${l3AB}AB, had a hit in ${l3WithHit}/3 games
  Last 5 games: ${l5Hits}H in ${l5AB}AB, had a hit in ${l5WithHit}/5 games
  Game log (recent first): ${gameLog.map(g => `${g.date}: ${g.hits}/${g.atBats} ${g.strikeOuts}K`).join(', ')}

━━━ OPPOSING PITCHER: ${pitcher.name} (Throws: ${pitcherHand}) ━━━

2026 SEASON SPLITS (current):
  vs LHB: ${splitLine(pitcher.splits, 'L')}
  vs RHB: ${splitLine(pitcher.splits, 'R')}
  vs this batter's hand (${batterHand}HB): BAA ${pitcherVsSplit.avg || 'N/A'} | WHIP ${pitcherVsSplit.whip || 'N/A'}

HISTORICAL (2025 context):
${pitcherHistoryBlock(pitcher, pitcherVsKey)}

  Last 3 starts: ${pitcherLog.map(g => `${g.date}: ${g.inningsPitched}IP ${g.earnedRuns}ER ${g.hits}H ${g.strikeOuts}K`).join(' | ') || 'N/A'}

━━━ MYSPORTSFEED DATA ━━━
${msfBlock}

━━━ BETTING ODDS ━━━
${oddsText}

━━━ ANALYSIS GUIDANCE ━━━
• MLB baseline hit probability: ~65–70% per game
• When 2026 sample < 40 AB, rely more on 2025/2024 historical splits
• 2025 data is most predictive for established players; 2024 adds sample size confirmation
• Matchup-specific split (batter vs pitcher handedness) is the most important single factor
• Hot streak (hit in 4+/5 games): +4–6%. Cold streak (0 hits in last 3): −4–6%
• High WHIP pitcher (>1.40) slightly suppresses hit probability; low WHIP (<1.10) suppresses more
• If MSF projection is available, treat projH as a strong signal — it incorporates matchup, park, weather
• If injury status is GTD or Q, reduce confidence and note it in reasoning
• L7/L14/L30 rolling averages are more recent form signals than the season split alone

Return ONLY valid JSON, no markdown, no explanation:
{
  "hitProbability": <integer 0-100>,
  "confidence": "low" | "medium" | "high",
  "recommendation": "strong_pick" | "good_value" | "neutral" | "lean_avoid" | "avoid",
  "hotCold": "hot" | "warm" | "neutral" | "cold" | "ice_cold",
  "edge": <float — hitProbability minus implied%, positive = value, null if no odds>,
  "reasoning": "<2-3 sentence analysis citing the most important data points>",
  "keyFactors": ["<specific factor with numbers>", "<specific factor with numbers>", "<specific factor with numbers>"]
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
