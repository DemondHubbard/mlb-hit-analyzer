const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const { loadBatterStatcast, loadPitcherStatcast } = require('./savant');

const router = express.Router();
const YEAR = new Date().getFullYear();

// Park factor for hits (>1.0 hitter-friendly, <1.0 pitcher-friendly) — 2024-25 data
const PARK_FACTORS = {
  'Coors Field': { factor: 1.18, label: 'extreme hitter (altitude, dry air)' },
  'Great American Ball Park': { factor: 1.10, label: 'hitter-friendly (tight corners, humid)' },
  'Globe Life Field': { factor: 1.07, label: 'hitter-friendly (hot/dry, spacious but fast turf)' },
  'Kauffman Stadium': { factor: 1.06, label: 'hitter-friendly (large outfield)' },
  'Fenway Park': { factor: 1.05, label: 'hitter-friendly (Green Monster, short LF)' },
  'Citizens Bank Park': { factor: 1.04, label: 'slightly hitter-friendly' },
  'Yankee Stadium': { factor: 1.03, label: 'slightly hitter-friendly (short RF porch)' },
  'Wrigley Field': { factor: 1.02, label: 'neutral-to-hitter (wind dependent)' },
  'American Family Field': { factor: 1.02, label: 'slightly hitter-friendly (dome, turf)' },
  'Minute Maid Park': { factor: 1.01, label: 'neutral (retractable roof, Crawford Boxes)' },
  'Guaranteed Rate Field': { factor: 1.01, label: 'neutral' },
  'Dodger Stadium': { factor: 1.00, label: 'neutral' },
  'Busch Stadium': { factor: 1.00, label: 'neutral' },
  'Truist Park': { factor: 0.99, label: 'neutral-to-pitcher' },
  'Chase Field': { factor: 0.99, label: 'neutral (retractable roof)' },
  'Target Field': { factor: 0.97, label: 'slightly pitcher-friendly (cold air, large outfield)' },
  'PNC Park': { factor: 0.97, label: 'slightly pitcher-friendly (large outfield)' },
  'Camden Yards': { factor: 0.97, label: 'slightly pitcher-friendly' },
  'LoanDepot Park': { factor: 0.97, label: 'slightly pitcher-friendly (dome, humid)' },
  'Citi Field': { factor: 0.96, label: 'pitcher-friendly (large park, marine air)' },
  'Angel Stadium': { factor: 0.96, label: 'pitcher-friendly (marine layer)' },
  'Progressive Field': { factor: 0.96, label: 'pitcher-friendly' },
  'Comerica Park': { factor: 0.95, label: 'pitcher-friendly (large outfield, cold)' },
  'Nationals Park': { factor: 0.95, label: 'pitcher-friendly' },
  'T-Mobile Park': { factor: 0.93, label: 'very pitcher-friendly (marine layer, humid, large)' },
  'Oracle Park': { factor: 0.92, label: 'very pitcher-friendly (sea breeze, large park)' },
  'Petco Park': { factor: 0.93, label: 'very pitcher-friendly (marine layer, cavernous)' },
};

function getParkFactor(venue) {
  if (!venue) return null;
  // Exact match
  if (PARK_FACTORS[venue]) return PARK_FACTORS[venue];
  // Partial match
  for (const [name, pf] of Object.entries(PARK_FACTORS)) {
    if (venue.includes(name) || name.includes(venue)) return pf;
  }
  return null;
}

function pct(val, fallback = 'N/A') {
  return val != null ? `${val}%` : fallback;
}

function dec(val, fallback = 'N/A') {
  return val != null ? val : fallback;
}

function splitLine(splits, hand) {
  if (!splits) return 'N/A';
  const s = splits[hand === 'L' ? 'vsLHP' : 'vsRHP'] || splits[hand === 'L' ? 'vsLHB' : 'vsRHB'];
  if (!s) return 'N/A';
  if (s.era !== undefined) {
    return `BAA ${s.avg} | ERA ${s.era} | WHIP ${s.whip} | ${s.strikeOuts}K / ${s.battersFaced}BF`;
  }
  return `AVG ${s.avg} | OBP ${s.obp} | SLG ${s.slg} | ${s.atBats}AB`;
}

function historicalBatterBlock(batter, vsKey) {
  const lines = [];
  for (const [year, field] of [['2025', 'splits2025'], ['2024', 'splits2024']]) {
    const s = batter[field];
    if (!s) continue;
    const split = s[vsKey];
    const other = s[vsKey === 'vsLHP' ? 'vsRHP' : 'vsLHP'];
    if (split?.atBats > 0)
      lines.push(`  ${year} vs same hand: AVG ${split.avg} | OBP ${split.obp} | SLG ${split.slg} | ${split.atBats}AB`);
    if (other?.atBats > 0)
      lines.push(`  ${year} vs opp hand:  AVG ${other.avg} | OBP ${other.obp} | SLG ${other.slg} | ${other.atBats}AB`);
  }
  return lines.length ? lines.join('\n') : '  No multi-year data available';
}

function pitcherHistoryBlock(pitcher, vsKey) {
  const s = pitcher.splits2025?.[vsKey];
  if (!s) return '  No 2025 data';
  return `  2025 vs same side: BAA ${s.avg} | ERA ${s.era} | WHIP ${s.whip} | ${s.strikeOuts}K/${s.battersFaced}BF`;
}

function computeBABIP(split) {
  if (!split) return null;
  const h  = split.hits       || 0;
  const hr = split.homeRuns   || 0;
  const ab = split.atBats     || 0;
  const k  = split.strikeOuts || 0;
  const denom = ab - k - hr;
  if (denom <= 0) return null;
  return ((h - hr) / denom).toFixed(3);
}

function lineupContext(order) {
  if (!order || order >= 999) return 'Unknown position — typical AB volume';
  if (order <= 2) return `#${order} — leadoff/2-hole, high OBP focus, ~4-5 PA/game`;
  if (order <= 5) return `#${order} — heart of order, premium at-bats, most RBI opportunities`;
  if (order <= 7) return `#${order} — mid-to-lower order, ~3-4 PA/game`;
  return `#${order} — bottom of order, fewest PA (~3/game), pitchers pitch carefully`;
}

router.post('/', async (req, res) => {
  const apiKey = req.headers['x-anthropic-api-key'] || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(400).json({
      error: 'Anthropic API key not configured. Add ANTHROPIC_API_KEY to .env or enter it in Settings.',
    });
  }

  const { batter, pitcher, odds, gameContext } = req.body;
  if (!batter || !pitcher) {
    return res.status(400).json({ error: 'Missing batter or pitcher data' });
  }

  const client = new Anthropic({ apiKey });

  // ── Handedness ──────────────────────────────────────────────────────────────
  const pitcherHand  = pitcher.hand || 'R';
  const batterHand   = batter.batSide === 'L' ? 'L' : (batter.batSide === 'S' ? 'S' : 'R');
  const vsKey        = pitcherHand === 'L' ? 'vsLHP' : 'vsRHP';
  const pitcherVsKey = (batterHand === 'L' || batterHand === 'S') ? 'vsLHB' : 'vsRHB';

  const relevantSplit  = batter.splits?.[vsKey]            || {};
  const pitcherVsSplit = pitcher.splits?.[pitcherVsKey]    || {};
  const smallSample26  = (relevantSplit.atBats || 0) < 40;

  // ── Game log ────────────────────────────────────────────────────────────────
  const gameLog   = batter.gameLog?.slice(0, 10) || [];
  const last3     = gameLog.slice(0, 3);
  const last5     = gameLog.slice(0, 5);
  const l3Hits    = last3.reduce((s, g) => s + (g.hits || 0), 0);
  const l3AB      = last3.reduce((s, g) => s + (g.atBats || 0), 0);
  const l5Hits    = last5.reduce((s, g) => s + (g.hits || 0), 0);
  const l5AB      = last5.reduce((s, g) => s + (g.atBats || 0), 0);
  const l3WithHit = last3.filter(g => g.hits > 0).length;
  const l5WithHit = last5.filter(g => g.hits > 0).length;
  const pitcherLog = pitcher.gameLog?.slice(0, 3) || [];

  // ── Odds ────────────────────────────────────────────────────────────────────
  let oddsText = 'No odds data';
  if (odds?.price != null) {
    const p = odds.price;
    const impl = p > 0 ? (100 / (p + 100)) * 100 : (Math.abs(p) / (Math.abs(p) + 100)) * 100;
    oddsText = `${p > 0 ? '+' : ''}${p} (implied: ${impl.toFixed(1)}%)`;
  }

  // ── BABIP ───────────────────────────────────────────────────────────────────
  const babip26 = computeBABIP(relevantSplit);
  const babip25 = computeBABIP(batter.splits2025?.[vsKey]);

  // ── Park factor ─────────────────────────────────────────────────────────────
  const venue    = gameContext?.venue || null;
  const isHome   = gameContext?.isHome ?? null;
  const park     = getParkFactor(venue);

  // ── Statcast — fetch from savant leaderboard (non-blocking fallback) ────────
  let sc = null, psc = null;
  try {
    const [batters, pitchers] = await Promise.all([loadBatterStatcast(), loadPitcherStatcast()]);
    sc  = batters[String(batter.id)]   || null;
    psc = pitchers[String(pitcher.id)] || null;
  } catch {
    // Savant unavailable — continue without it
  }

  // ── MSF block ───────────────────────────────────────────────────────────────
  const msf = batter.msf || null;
  const msfBlock = (() => {
    if (!msf) return '  MySportsFeed not available';
    const lines = [];
    if (msf.injury?.status)
      lines.push(`  ⚠ INJURY: ${msf.injury.status} — ${msf.injury.description || 'details unknown'}`);
    const r = msf.rolling || {};
    if (r.L7)  lines.push(`  L7  rolling AVG: ${r.L7.avg}  (${r.L7.H}H / ${r.L7.AB}AB, ${r.L7.games} games)`);
    if (r.L14) lines.push(`  L14 rolling AVG: ${r.L14.avg} (${r.L14.H}H / ${r.L14.AB}AB, ${r.L14.games} games)`);
    if (r.L30) lines.push(`  L30 rolling AVG: ${r.L30.avg} (${r.L30.H}H / ${r.L30.AB}AB, ${r.L30.games} games)`);
    const p = msf.projections;
    if (p?.projH != null) lines.push(`  DFS projection: ${p.projH.toFixed(2)}H in ${p.projAB?.toFixed(2)}AB`);
    return lines.length ? lines.join('\n') : '  No MSF data returned';
  })();

  // ── Home/Away splits block ───────────────────────────────────────────────────
  const homeAwaySplits = batter.splitHomeAway;
  const homeAwaySplitsBlock = (() => {
    if (!homeAwaySplits?.home && !homeAwaySplits?.away) return '  Not available';
    const lines = [];
    const loc = isHome === true ? 'home' : isHome === false ? 'away' : null;
    const { home, away } = homeAwaySplits;
    if (home?.atBats > 0)
      lines.push(`  Home: AVG ${home.avg} | OBP ${home.obp} | SLG ${home.slg} | ${home.atBats}AB`);
    if (away?.atBats > 0)
      lines.push(`  Away: AVG ${away.avg} | OBP ${away.obp} | SLG ${away.slg} | ${away.atBats}AB`);
    if (loc) {
      const rel = loc === 'home' ? home : away;
      if (rel?.atBats > 0)
        lines.push(`  ★ Today plays ${loc.toUpperCase()} — relevant split: AVG ${rel.avg} | OBP ${rel.obp}`);
    }
    return lines.join('\n') || '  No home/away data';
  })();

  // ── vs This Pitcher (career) ─────────────────────────────────────────────────
  const vsPitcher = batter.vsPitcher;
  const vsPitcherBlock = (() => {
    if (!vsPitcher || !vsPitcher.atBats) return '  No career matchup data (first time facing)';
    const { atBats, hits, homeRuns, strikeOuts, avg, obp, slg, plateAppearances } = vsPitcher;
    const pa = plateAppearances || atBats;
    return `  Career: ${hits}H / ${atBats}AB — AVG ${avg} | OBP ${obp} | SLG ${slg} | ${homeRuns}HR | ${strikeOuts}K in ${pa}PA`;
  })();

  // ── Statcast block — batter ──────────────────────────────────────────────────
  const scBlock = (() => {
    if (!sc) return '  Savant data unavailable (may need more PA)';
    const lines = [
      `  Exit Velocity: ${dec(sc.exitVelocity)} mph | Launch Angle: ${dec(sc.launchAngle)}°`,
      `  Sweet Spot%: ${pct(sc.sweetSpot)} | Barrel Rate: ${pct(sc.barrelRate)} | Hard Hit%: ${pct(sc.hardHitRate)}`,
      `  xBA: ${dec(sc.xba)} | xwOBA: ${dec(sc.xwoba)}${sc.xslg ? ` | xSLG: ${sc.xslg}` : ''}`,
      `  K%: ${pct(sc.kRate)} | BB%: ${pct(sc.bbRate)}${sc.whiffRate ? ` | Whiff%: ${pct(sc.whiffRate)}` : ''}`,
    ];
    if (sc.pa) lines.push(`  Sample: ${sc.pa} PA`);
    return lines.join('\n');
  })();

  // ── Statcast block — pitcher ─────────────────────────────────────────────────
  const pscBlock = (() => {
    if (!psc) return '  Savant data unavailable';
    const lines = [
      `  EV Allowed: ${dec(psc.exitVelocityAllowed)} mph | Barrel Rate Allowed: ${pct(psc.barrelRateAllowed)} | Hard Hit% Allowed: ${pct(psc.hardHitRateAllowed)}`,
      `  xBA Against: ${dec(psc.xbaAgainst)} | xwOBA Against: ${dec(psc.xwobaAgainst)}`,
      `  K%: ${pct(psc.kRate)} | BB%: ${pct(psc.bbRate)}${psc.whiffRate ? ` | Whiff%: ${pct(psc.whiffRate)}` : ''}`,
    ];
    return lines.join('\n');
  })();

  // ── Park context ─────────────────────────────────────────────────────────────
  const parkBlock = (() => {
    if (!park) return venue ? `  ${venue} — Park factor not on record (treat as neutral)` : '  Venue unknown';
    const arrow = park.factor > 1.04 ? '↑' : park.factor < 0.96 ? '↓' : '→';
    return `  ${venue} — Park factor: ${park.factor.toFixed(2)} ${arrow} (${park.label})`;
  })();

  // ── Full prompt ──────────────────────────────────────────────────────────────
  const prompt = `You are an elite MLB prop betting analyst. Your task: calculate the probability that ${batter.name} records AT LEAST 1 hit today.

━━━ BATTER: ${batter.name} (Bats: ${batterHand} | Pos: ${batter.position || 'UT'} | ${lineupContext(batter.lineupOrder)}) ━━━

2026 SEASON — HANDEDNESS SPLIT (vs ${pitcherHand}HP, TODAY'S MATCHUP):
  AVG ${relevantSplit.avg || 'N/A'} | OBP ${relevantSplit.obp || 'N/A'} | SLG ${relevantSplit.slg || 'N/A'} | ${relevantSplit.atBats || 0}AB | K: ${relevantSplit.strikeOuts || 0}${babip26 ? ` | BABIP: ${babip26}` : ''}
  ${smallSample26 ? '⚠ SMALL SAMPLE (<40 AB) — lean on Statcast xBA and historical splits more heavily' : ''}

HISTORICAL SPLITS (2025–2024):
${historicalBatterBlock(batter, vsKey)}

STATCAST QUALITY OF CONTACT (${YEAR}):
${scBlock}

HOME/AWAY SPLITS (${YEAR}):
${homeAwaySplitsBlock}

VS THIS PITCHER (career):
${vsPitcherBlock}

RECENT FORM:
  Last 3 games: ${l3Hits}H / ${l3AB}AB — hit in ${l3WithHit}/3 games
  Last 5 games: ${l5Hits}H / ${l5AB}AB — hit in ${l5WithHit}/5 games
  Game log (recent first): ${gameLog.map(g => `${g.date}: ${g.hits}/${g.atBats}${g.strikeOuts > 0 ? ` ${g.strikeOuts}K` : ''}`).join(', ') || 'N/A'}

━━━ OPPOSING PITCHER: ${pitcher.name} (Throws: ${pitcherHand}) ━━━

2026 SPLITS:
  vs LHB: ${splitLine(pitcher.splits, 'L')}
  vs RHB: ${splitLine(pitcher.splits, 'R')}
  vs this batter's hand (${batterHand}): BAA ${pitcherVsSplit.avg || 'N/A'} | WHIP ${pitcherVsSplit.whip || 'N/A'} | K: ${pitcherVsSplit.strikeOuts || 'N/A'}

HISTORICAL (2025):
${pitcherHistoryBlock(pitcher, pitcherVsKey)}

STATCAST CONTACT ALLOWED (${YEAR}):
${pscBlock}

LAST 3 STARTS: ${pitcherLog.map(g => `${g.date}: ${g.inningsPitched}IP ${g.earnedRuns}ER ${g.hits}H ${g.strikeOuts}K`).join(' | ') || 'N/A'}

TEAM PITCHING STAFF (${YEAR} — starter + bullpen aggregate):
${(() => {
  const tp = pitcher.teamPitching;
  if (!tp) return '  Not available';
  const lines = [`  Staff ERA: ${tp.era || 'N/A'} | Staff WHIP: ${tp.whip || 'N/A'} | BAA: ${tp.avg || 'N/A'}`];
  if (tp.strikeoutsPer9) lines.push(`  K/9: ${tp.strikeoutsPer9} | BB/9: ${tp.walksPer9 || 'N/A'}`);
  lines.push('  (Use as proxy for bullpen quality if starter exits early)');
  return lines.join('\n');
})()}

━━━ PARK & GAME CONTEXT ━━━
${parkBlock}
  Batter is playing: ${isHome === true ? 'HOME' : isHome === false ? 'AWAY' : 'location unknown'}

━━━ MYSPORTSFEED DATA ━━━
${msfBlock}

━━━ BETTING ODDS ━━━
  ${oddsText}

━━━ ANALYSIS WEIGHTS (use these to calibrate) ━━━
• MLB baseline probability of 1+ hit: ~65–68% per game

BATTER CONTACT & DISCIPLINE:
  - xBA > actual AVG by 30+ pts → positive BABIP regression likely, boost probability +3–5%
  - Platoon advantage: same-handed matchup can shift OPS 100–150 pts for platoon-heavy hitters
  - Hard Hit% > 42% or barrel rate > 9% = elite contact; below 30% hard hit = weak contact
  - K% < 16% = elite contact rate (+3–4%); K% > 28% = swing-and-miss risk (−3–5%)
  - Sweet spot% > 35% = optimal launch angle, high BABIP on contact
  - CONTACT HITTER PROFILE: batter K% < 16% AND BB% < 8% = extreme contact hitter (swings early,
    puts everything in play, very high floor) — this profile typically adds +3–5% hit probability
  - PATIENT HITTER PROFILE: batter BB% > 12% — sees more pitches, works into hitter's counts;
    if facing a wild pitcher (BB% > 10%), this batter will see more fat pitches to hit (+2–3%)

PITCHER WALK RATE & COUNT DYNAMICS:
  - Pitcher BB% > 10%: consistently falls behind in counts — batter sees more fastballs/meatballs,
    higher probability of a hittable pitch each PA → boost hit probability +3–5%
  - Pitcher BB% 8–10%: moderate wildness, slight batter advantage in counts (+1–2%)
  - Pitcher BB% < 6%: excellent control, gets ahead of hitters, can use full arsenal → −2–3%
  - Pitcher K% > 28% + low BB%: elite two-way pitcher, most dangerous matchup for a hit prop
  - Pitcher K% < 18% + high BB%: control problems AND weak strikeout stuff = very hitter-friendly
  - A wild pitcher (high BB%) is ESPECIALLY favorable for patient batters (high batter BB%) because
    they will get into favorable counts more and see more pitches in their zone

BULLPEN CONTEXT:
  - Staff ERA > 4.50 or Staff WHIP > 1.40: weak bullpen — if starter is flagging (high pitch count,
    early exits in recent starts), expect relief pitcher exposure which boosts hit probability +2–4%
  - Staff ERA < 3.50 and WHIP < 1.15: elite bullpen — late innings become very pitcher-friendly
  - If starter's recent BB/9 is high (wild): likely exits early, bullpen quality becomes key factor
  - Batter's walk rate vs pitcher's walk rate: if batter BB% > pitcher BB%, batter is more disciplined
    than pitcher is controlled — this is a meaningful edge for the batter

FORM signals (medium weight):
  - Hot streak (hit in 4+/5 recent games): +4–6% — but regresses to mean
  - Ice cold (0 hits in last 4 games): −5–7%
  - L7/L14 rolling AVG > .300: meaningful hot hand signal

PITCHER CONTACT QUALITY:
  - High xBA Against (>.275): pitcher allows hard contact, boost batter probability
  - Low xBA Against (<.230): dominant contact suppressor, reduce batter probability
  - WHIP > 1.40: hitter-friendly; WHIP < 1.00: elite, reduce batter probability

PARK & CONTEXT (light weight):
  - Coors: +5–8%; Oracle/Petco/T-Mobile: −4–6%; neutral parks: 0%
  - Lineup #1-2: +1% (extra PA); Lineup #8-9: −1% (fewer PA)
  - Career matchup history: significant only if 20+ AB (small sample otherwise)
  - Home/away: meaningful for players with >15 pt AVG split difference

• If MSF projection available: projH > 1.0 is bullish; projH < 0.6 is bearish
• Injury (GTD/Q): reduce confidence to low, note in reasoning

Return ONLY valid JSON, no markdown:
{
  "hitProbability": <integer 0-100>,
  "confidence": "low" | "medium" | "high",
  "recommendation": "strong_pick" | "good_value" | "neutral" | "lean_avoid" | "avoid",
  "hotCold": "hot" | "warm" | "neutral" | "cold" | "ice_cold",
  "edge": <float — hitProbability minus implied%, positive = value, null if no odds>,
  "reasoning": "<2-3 sentences citing the most important data points with specific numbers>",
  "keyFactors": [
    "<specific factor with exact numbers — e.g. xBA .312 vs actual .241 signals positive regression>",
    "<specific factor>",
    "<specific factor>"
  ]
}`;

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = message.content[0]?.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Claude returned non-JSON response');
    res.json(JSON.parse(jsonMatch[0]));
  } catch (err) {
    console.error('Analyze error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
