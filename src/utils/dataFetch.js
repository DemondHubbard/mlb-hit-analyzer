import {
  processPitcherSplits, processPitcherGameLog,
  processBatterSplits, processBatterGameLog,
  processBatterHomeAway, processVsPitcher,
  extractLineupFromLive, extractFromRoster,
  apiFetch,
} from './helpers.js';
import { loadCache, saveCache, PLAYER_KEY, today } from './cache.js';

async function fetchJSON(url) {
  const resp = await apiFetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status} — ${url}`);
  return resp.json();
}

async function fetchSoft(url) {
  try { return await fetchJSON(url); } catch { return null; }
}

export async function loadPitcher(pitcherStub, teamId) {
  if (!pitcherStub?.id) return null;
  const cacheKey = PLAYER_KEY(`pitcher_${pitcherStub.id}`, today);
  const cached = loadCache(cacheKey);
  if (cached) return cached;

  const [info, splits26, splits25, log, teamPitching] = await Promise.all([
    fetchJSON(`/api/mlb/people/${pitcherStub.id}`),
    fetchJSON(`/api/mlb/people/${pitcherStub.id}/stats?stats=statSplits&group=pitching&season=2026&sitCodes=vl,vr&gameType=R`),
    fetchSoft(`/api/mlb/people/${pitcherStub.id}/stats?stats=statSplits&group=pitching&season=2025&sitCodes=vl,vr&gameType=R`),
    fetchJSON(`/api/mlb/people/${pitcherStub.id}/stats?stats=gameLog&group=pitching&season=2026&gameType=R`),
    teamId ? fetchSoft(`/api/mlb/teams/${teamId}/pitching`) : Promise.resolve(null),
  ]);

  const person = info?.people?.[0] || {};
  const teamStat = teamPitching?.stats?.[0]?.splits?.[0]?.stat || null;
  const result = {
    id: person.id || pitcherStub.id,
    name: person.fullName || pitcherStub.name,
    hand: person.pitchHand?.code || 'R',
    splits: processPitcherSplits(splits26),
    splits2025: splits25 ? processPitcherSplits(splits25) : null,
    gameLog: processPitcherGameLog(log),
    teamPitching: teamStat ? {
      era: teamStat.era || null,
      whip: teamStat.whip || null,
      avg: teamStat.avg || null,
      strikeoutsPer9: teamStat.strikeoutsPer9Inn || null,
      walksPer9: teamStat.walksPer9Inn || null,
    } : null,
  };
  saveCache(cacheKey, result);
  return result;
}

export async function loadBatter(batterStub, pitcherId) {
  if (!batterStub?.id) return null;
  const cacheKey = PLAYER_KEY(batterStub.id, today);
  const cached = loadCache(cacheKey);
  if (cached) {
    const base = { ...cached, lineupOrder: batterStub.battingOrder ?? cached.lineupOrder };
    if (pitcherId && !cached.vsPitcher) {
      const h2h = await fetchSoft(
        `/api/mlb/people/${batterStub.id}/stats?stats=vsPlayer&group=hitting&opposingPlayerId=${pitcherId}&gameType=R`
      );
      base.vsPitcher = h2h ? processVsPitcher(h2h) : null;
    }
    return base;
  }

  const [info, splits26, splits25, splits24, log, homeAway, vsPitcherRaw] = await Promise.all([
    fetchJSON(`/api/mlb/people/${batterStub.id}`),
    fetchJSON(`/api/mlb/people/${batterStub.id}/stats?stats=statSplits&group=hitting&season=2026&sitCodes=vl,vr&gameType=R`),
    fetchSoft(`/api/mlb/people/${batterStub.id}/stats?stats=statSplits&group=hitting&season=2025&sitCodes=vl,vr&gameType=R`),
    fetchSoft(`/api/mlb/people/${batterStub.id}/stats?stats=statSplits&group=hitting&season=2024&sitCodes=vl,vr&gameType=R`),
    fetchJSON(`/api/mlb/people/${batterStub.id}/stats?stats=gameLog&group=hitting&season=2026&gameType=R`),
    fetchSoft(`/api/mlb/people/${batterStub.id}/stats?stats=statSplits&group=hitting&season=2026&sitCodes=h,a&gameType=R`),
    pitcherId
      ? fetchSoft(`/api/mlb/people/${batterStub.id}/stats?stats=vsPlayer&group=hitting&opposingPlayerId=${pitcherId}&gameType=R`)
      : Promise.resolve(null),
  ]);

  const person = info?.people?.[0] || {};
  const result = {
    id: person.id || batterStub.id,
    name: person.fullName || batterStub.name || 'Unknown',
    position: batterStub.position || person.primaryPosition?.abbreviation || 'UT',
    batSide: person.batSide?.code || 'R',
    lineupOrder: batterStub.battingOrder ?? 999,
    splits: processBatterSplits(splits26),
    splits2025: splits25 ? processBatterSplits(splits25) : null,
    splits2024: splits24 ? processBatterSplits(splits24) : null,
    splitHomeAway: homeAway ? processBatterHomeAway(homeAway) : null,
    vsPitcher: vsPitcherRaw ? processVsPitcher(vsPitcherRaw) : null,
    gameLog: processBatterGameLog(log),
  };
  saveCache(cacheKey, result);
  return result;
}

export async function getLineup(gamePk, teamId, isHome) {
  try {
    const live = await fetchJSON(`/api/mlb/game/${gamePk}/live`);
    const lineup = extractLineupFromLive(live, isHome);
    if (lineup?.length >= 1) return { batters: lineup, fromLive: true };
  } catch { /* fall through */ }

  try {
    const roster = await fetchJSON(`/api/mlb/teams/${teamId}/roster?rosterType=active`);
    return { batters: extractFromRoster(roster), fromLive: false };
  } catch {
    return { batters: [], fromLive: false };
  }
}
