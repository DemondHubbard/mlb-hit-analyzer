export function formatTime(isoDate) {
  if (!isoDate) return 'TBD';
  try {
    return new Date(isoDate).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    });
  } catch {
    return isoDate;
  }
}

export function formatDate(isoDate) {
  if (!isoDate) return '';
  try {
    return new Date(isoDate).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return isoDate;
  }
}

export function impliedProbability(americanOdds) {
  if (americanOdds == null) return null;
  if (americanOdds > 0) return (100 / (americanOdds + 100)) * 100;
  return (Math.abs(americanOdds) / (Math.abs(americanOdds) + 100)) * 100;
}

export function formatOdds(price) {
  if (price == null) return '—';
  return price > 0 ? `+${price}` : `${price}`;
}

export function normalizeName(name) {
  return (name || '').toLowerCase().replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();
}

export function matchOdds(playerName, oddsLookup) {
  if (!oddsLookup || !playerName) return null;
  const normalized = normalizeName(playerName);

  if (oddsLookup[normalized]) return oddsLookup[normalized];

  // Try last name match
  const lastName = normalized.split(' ').pop();
  for (const [key, val] of Object.entries(oddsLookup)) {
    if (key.endsWith(lastName)) return val;
  }

  // Try first + last word match
  const parts = normalized.split(' ');
  if (parts.length >= 2) {
    const firstInitial = parts[0][0];
    const last = parts[parts.length - 1];
    for (const [key, val] of Object.entries(oddsLookup)) {
      const kParts = key.split(' ');
      if (kParts.length >= 2 && kParts[kParts.length - 1] === last && kParts[0][0] === firstInitial) {
        return val;
      }
    }
  }

  return null;
}

export function parseGames(data) {
  const games = [];
  for (const date of data.dates || []) {
    for (const g of date.games || []) {
      games.push({
        gamePk: g.gamePk,
        gameDate: g.gameDate,
        status: g.status?.detailedState || g.status?.abstractGameState || 'Scheduled',
        abstractState: g.status?.abstractGameState,
        venue: g.venue?.name,
        away: {
          teamId: g.teams?.away?.team?.id,
          teamName: g.teams?.away?.team?.name,
          teamAbbrev: g.teams?.away?.team?.abbreviation || g.teams?.away?.team?.name?.slice(0, 3).toUpperCase(),
          pitcher: g.teams?.away?.probablePitcher
            ? { id: g.teams.away.probablePitcher.id, name: g.teams.away.probablePitcher.fullName }
            : null,
        },
        home: {
          teamId: g.teams?.home?.team?.id,
          teamName: g.teams?.home?.team?.name,
          teamAbbrev: g.teams?.home?.team?.abbreviation || g.teams?.home?.team?.name?.slice(0, 3).toUpperCase(),
          pitcher: g.teams?.home?.probablePitcher
            ? { id: g.teams.home.probablePitcher.id, name: g.teams.home.probablePitcher.fullName }
            : null,
        },
      });
    }
  }
  return games;
}

export function processPitcherSplits(data) {
  const splits = { vsLHB: null, vsRHB: null };
  for (const stat of data?.stats || []) {
    for (const split of stat?.splits || []) {
      const code = split.split?.code;
      const s = split.stat || {};
      const entry = {
        avg: s.avg || '.000',
        era: s.era || '0.00',
        whip: s.whip || '0.00',
        strikeOuts: s.strikeOuts || 0,
        battersFaced: s.battersFaced || 0,
        inningsPitched: s.inningsPitched || '0.0',
        hits: s.hits || 0,
        atBats: s.atBats || 0,
      };
      if (code === 'vl') splits.vsLHB = entry;
      else if (code === 'vr') splits.vsRHB = entry;
    }
  }
  return splits;
}

export function processPitcherGameLog(data) {
  const log = [];
  for (const stat of data?.stats || []) {
    for (const split of stat?.splits || []) {
      const s = split.stat || {};
      log.push({
        date: split.date || split.season || '',
        inningsPitched: s.inningsPitched || '0.0',
        earnedRuns: s.earnedRuns || 0,
        hits: s.hits || 0,
        strikeOuts: s.strikeOuts || 0,
        homeRuns: s.homeRuns || 0,
        walks: s.baseOnBalls || 0,
      });
    }
  }
  return log.slice(0, 10);
}

export function processBatterSplits(data) {
  const splits = { vsLHP: null, vsRHP: null };
  for (const stat of data?.stats || []) {
    for (const split of stat?.splits || []) {
      const code = split.split?.code;
      const s = split.stat || {};
      const entry = {
        avg: s.avg || '.000',
        obp: s.obp || '.000',
        slg: s.slg || '.000',
        ops: s.ops || '.000',
        atBats: s.atBats || 0,
        hits: s.hits || 0,
        strikeOuts: s.strikeOuts || 0,
        homeRuns: s.homeRuns || 0,
      };
      if (code === 'vl') splits.vsLHP = entry;
      else if (code === 'vr') splits.vsRHP = entry;
    }
  }
  return splits;
}

export function processBatterHomeAway(data) {
  const splits = { home: null, away: null };
  for (const stat of data?.stats || []) {
    for (const split of stat?.splits || []) {
      const code = split.split?.code;
      const s = split.stat || {};
      const entry = {
        avg: s.avg || '.000',
        obp: s.obp || '.000',
        slg: s.slg || '.000',
        ops: s.ops || '.000',
        atBats: s.atBats || 0,
        hits: s.hits || 0,
        strikeOuts: s.strikeOuts || 0,
        homeRuns: s.homeRuns || 0,
      };
      if (code === 'h') splits.home = entry;
      else if (code === 'a') splits.away = entry;
    }
  }
  return splits;
}

export function processVsPitcher(data) {
  for (const stat of data?.stats || []) {
    for (const split of stat?.splits || []) {
      const s = split.stat;
      if (!s) continue;
      return {
        atBats: s.atBats || 0,
        hits: s.hits || 0,
        homeRuns: s.homeRuns || 0,
        strikeOuts: s.strikeOuts || 0,
        avg: s.avg || '.000',
        obp: s.obp || '.000',
        slg: s.slg || '.000',
        plateAppearances: s.plateAppearances || s.atBats || 0,
      };
    }
  }
  return null;
}

export function processBatterGameLog(data) {
  const log = [];
  for (const stat of data?.stats || []) {
    for (const split of stat?.splits || []) {
      const s = split.stat || {};
      log.push({
        date: split.date || '',
        hits: s.hits || 0,
        atBats: s.atBats || 0,
        strikeOuts: s.strikeOuts || 0,
        homeRuns: s.homeRuns || 0,
        rbi: s.rbi || 0,
      });
    }
  }
  return log.slice(0, 10);
}

export function extractLineupFromLive(liveData, isHome) {
  const side = isHome ? 'home' : 'away';
  const team = liveData?.liveData?.boxscore?.teams?.[side];
  if (!team) return null;

  const batters = team.batters || [];
  const players = team.players || {};

  if (!batters.length) return null;

  return batters
    .map((id) => {
      const p = players[`ID${id}`];
      if (!p) return null;
      return {
        id,
        name: p.person?.fullName,
        position: p.position?.abbreviation || 'UT',
        battingOrder: parseInt(p.battingOrder || '999'),
      };
    })
    .filter(Boolean)
    .filter(p => p.name)
    .sort((a, b) => a.battingOrder - b.battingOrder);
}

export function extractFromRoster(rosterData, excludePitchers = true) {
  return (rosterData?.roster || [])
    .filter(p => !excludePitchers || !['P', 'TWP'].includes(p.position?.abbreviation))
    .map(p => ({
      id: p.person?.id,
      name: p.person?.fullName,
      position: p.position?.abbreviation || 'UT',
      battingOrder: 999,
    }))
    .filter(p => p.id && p.name);
}

export async function fetchMsfPlayer(playerName) {
  try {
    const resp = await apiFetch(`/api/msf/player?name=${encodeURIComponent(playerName)}`);
    if (!resp.ok) return null;
    const data = await resp.json();
    if (data.error) return null;
    return data;
  } catch {
    return null;
  }
}

export function apiFetch(url, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const oddsKey = localStorage.getItem('odds_api_key');
  const anthropicKey = localStorage.getItem('anthropic_api_key');
  if (oddsKey) headers['x-odds-api-key'] = oddsKey;
  if (anthropicKey) headers['x-anthropic-api-key'] = anthropicKey;
  return fetch(url, { ...options, headers });
}
