import React, { useState, useCallback } from 'react';
import PitcherPanel from './PitcherPanel.jsx';
import BatterCard from './BatterCard.jsx';
import SummaryBar from './SummaryBar.jsx';
import ErrorBoundary from './ErrorBoundary.jsx';
import { BatterCardSkeleton, PitcherSkeleton } from './LoadingSkeletons.jsx';
import { formatTime } from '../utils/helpers.js';
import {
  loadCache, saveCache, PLAYER_KEY, today,
} from '../utils/cache.js';
import {
  processPitcherSplits, processPitcherGameLog,
  processBatterSplits, processBatterGameLog,
  extractLineupFromLive, extractFromRoster,
  apiFetch,
} from '../utils/helpers.js';

async function fetchJSON(url) {
  const resp = await apiFetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status} — ${url}`);
  return resp.json();
}

async function loadPitcher(pitcherStub) {
  if (!pitcherStub?.id) return null;
  const cacheKey = PLAYER_KEY(`pitcher_${pitcherStub.id}`, today);
  const cached = loadCache(cacheKey);
  if (cached) return cached;

  const [info, splits, log] = await Promise.all([
    fetchJSON(`/api/mlb/people/${pitcherStub.id}`),
    fetchJSON(`/api/mlb/people/${pitcherStub.id}/stats?stats=statSplits&group=pitching&season=2026&sitCodes=vl,vr&gameType=R`),
    fetchJSON(`/api/mlb/people/${pitcherStub.id}/stats?stats=gameLog&group=pitching&season=2026&gameType=R`),
  ]);

  const person = info?.people?.[0] || {};
  const result = {
    id: person.id || pitcherStub.id,
    name: person.fullName || pitcherStub.name,
    hand: person.pitchHand?.code || 'R',
    splits: processPitcherSplits(splits),
    gameLog: processPitcherGameLog(log),
  };
  saveCache(cacheKey, result);
  return result;
}

async function loadBatter(batterStub) {
  if (!batterStub?.id) return null;
  const cacheKey = PLAYER_KEY(batterStub.id, today);
  const cached = loadCache(cacheKey);
  if (cached) {
    // Preserve lineup order from live data
    return { ...cached, lineupOrder: batterStub.battingOrder ?? cached.lineupOrder };
  }

  const [info, splits, log] = await Promise.all([
    fetchJSON(`/api/mlb/people/${batterStub.id}`),
    fetchJSON(`/api/mlb/people/${batterStub.id}/stats?stats=statSplits&group=hitting&season=2026&sitCodes=vl,vr&gameType=R`),
    fetchJSON(`/api/mlb/people/${batterStub.id}/stats?stats=gameLog&group=hitting&season=2026&gameType=R`),
  ]);

  const person = info?.people?.[0] || {};
  const result = {
    id: person.id || batterStub.id,
    name: person.fullName || batterStub.name || 'Unknown',
    position: batterStub.position || person.primaryPosition?.abbreviation || 'UT',
    batSide: person.batSide?.code || 'R',
    lineupOrder: batterStub.battingOrder ?? 999,
    splits: processBatterSplits(splits),
    gameLog: processBatterGameLog(log),
  };
  saveCache(cacheKey, result);
  return result;
}

async function getLineup(gamePk, teamId, isHome) {
  try {
    const live = await fetchJSON(`/api/mlb/game/${gamePk}/live`);
    const lineup = extractLineupFromLive(live, isHome);
    if (lineup?.length >= 1) return { batters: lineup, fromLive: true };
  } catch {
    // fall through
  }

  try {
    const roster = await fetchJSON(`/api/mlb/teams/${teamId}/roster?rosterType=active`);
    const batters = extractFromRoster(roster);
    return { batters, fromLive: false };
  } catch {
    return { batters: [], fromLive: false };
  }
}

export default function GameAnalysis({ game, onBack }) {
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [lineupNotice, setLineupNotice] = useState('');

  const [awayPitcher, setAwayPitcher] = useState(null);
  const [homePitcher, setHomePitcher] = useState(null);
  const [awayBatters, setAwayBatters] = useState([]);
  const [homeBatters, setHomeBatters] = useState([]);
  const [oddsLookup, setOddsLookup] = useState({});

  const [activeTab, setActiveTab] = useState('away');
  const [sortBy, setSortBy] = useState('lineup');
  const [analyses, setAnalyses] = useState({});
  const [analyzeAllLoading, setAnalyzeAllLoading] = useState(false);

  const handleLoad = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [
        awayP, homeP,
        awayLineup, homeLineup,
        oddsResp,
      ] = await Promise.all([
        loadPitcher(game.away.pitcher),
        loadPitcher(game.home.pitcher),
        getLineup(game.gamePk, game.away.teamId, false),
        getLineup(game.gamePk, game.home.teamId, true),
        apiFetch('/api/odds').then(r => r.json()).catch(() => ({ lookup: {} })),
      ]);

      setAwayPitcher(awayP);
      setHomePitcher(homeP);
      setOddsLookup(oddsResp?.lookup || {});

      const notices = [];
      if (!awayLineup.fromLive) notices.push(`${game.away.teamAbbrev} lineup not posted — showing roster`);
      if (!homeLineup.fromLive) notices.push(`${game.home.teamAbbrev} lineup not posted — showing roster`);
      if (notices.length) setLineupNotice(notices.join(' · '));

      const allBatterStubs = [
        ...awayLineup.batters.slice(0, 9),
        ...homeLineup.batters.slice(0, 9),
      ];

      const allBatters = await Promise.all(allBatterStubs.map(loadBatter));

      const awayIds = new Set(awayLineup.batters.slice(0, 9).map(b => b.id));
      setAwayBatters(allBatters.filter(b => b && awayIds.has(b.id)));
      setHomeBatters(allBatters.filter(b => b && !awayIds.has(b.id)));
      setLoaded(true);
    } catch (e) {
      setLoadError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAnalysisComplete = useCallback((playerId, result) => {
    setAnalyses(prev => {
      const batter = [...awayBatters, ...homeBatters].find(b => b.id === playerId);
      return { ...prev, [playerId]: { ...result, _name: batter?.name } };
    });
  }, [awayBatters, homeBatters]);

  const handleAnalyzeAll = async () => {
    const tabBatters = activeTab === 'away' ? awayBatters : homeBatters;
    const pitcher = activeTab === 'away' ? homePitcher : awayPitcher;
    const unanalyzed = tabBatters.filter(b => !analyses[b.id]);
    if (!unanalyzed.length) return;

    setAnalyzeAllLoading(true);
    for (const batter of unanalyzed) {
      try {
        const resp = await apiFetch('/api/analyze', {
          method: 'POST',
          body: JSON.stringify({ batter, pitcher, odds: null }),
        });
        if (resp.ok) {
          const data = await resp.json();
          setAnalyses(prev => ({ ...prev, [batter.id]: { ...data, _name: batter.name } }));
        }
      } catch {
        // skip failed
      }
    }
    setAnalyzeAllLoading(false);
  };

  const tabBatters = activeTab === 'away' ? awayBatters : homeBatters;
  const facingPitcher = activeTab === 'away' ? homePitcher : awayPitcher;

  const sortedBatters = [...tabBatters].sort((a, b) => {
    if (sortBy === 'probability') {
      const ap = analyses[a.id]?.hitProbability ?? -1;
      const bp = analyses[b.id]?.hitProbability ?? -1;
      return bp - ap;
    }
    return (a.lineupOrder ?? 999) - (b.lineupOrder ?? 999);
  });

  const tabAnalyses = Object.fromEntries(
    Object.entries(analyses).filter(([id]) => tabBatters.some(b => b.id === Number(id)))
  );

  const awayFacing = homePitcher?.hand;
  const homeFacing = awayPitcher?.hand;

  return (
    <div>
      {/* Back + title */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={onBack}
          className="text-gray-400 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-gray-800"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div>
          <h2 className="text-lg font-bold text-white">
            {game.away.teamAbbrev} @ {game.home.teamAbbrev}
          </h2>
          <p className="text-sm text-gray-500">{formatTime(game.gameDate)} · {game.venue || ''}</p>
        </div>
      </div>

      {/* Pitchers */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        {loaded ? (
          <>
            <PitcherPanel pitcher={awayPitcher} label={`${game.away.teamAbbrev} SP`} facingHand={homeFacing} />
            <PitcherPanel pitcher={homePitcher} label={`${game.home.teamAbbrev} SP`} facingHand={awayFacing} />
          </>
        ) : (
          <>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">{game.away.teamAbbrev} SP</p>
              <p className="font-semibold text-white">{game.away.pitcher?.name || 'TBD'}</p>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">{game.home.teamAbbrev} SP</p>
              <p className="font-semibold text-white">{game.home.pitcher?.name || 'TBD'}</p>
            </div>
          </>
        )}
      </div>

      {/* Load button or lineup notice */}
      {!loaded && !loading && (
        <div className="text-center py-8">
          {loadError && (
            <div className="mb-4 bg-red-950 border border-red-800 rounded-xl px-5 py-3 text-sm text-red-400 max-w-md mx-auto">
              {loadError}
            </div>
          )}
          <button
            onClick={handleLoad}
            className="bg-blue-700 hover:bg-blue-600 text-white font-semibold px-8 py-3.5 rounded-2xl text-base transition-all shadow-lg shadow-blue-900/30 hover:-translate-y-0.5"
          >
            Load lineup & stats
          </button>
        </div>
      )}

      {loading && (
        <div className="text-center py-8">
          <div className="inline-flex items-center gap-3 text-gray-400">
            <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
            Loading lineup & stats...
          </div>
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-4xl mx-auto">
            {[...Array(6)].map((_, i) => <BatterCardSkeleton key={i} />)}
          </div>
        </div>
      )}

      {loaded && (
        <>
          {lineupNotice && (
            <div className="mb-4 bg-yellow-950/50 border border-yellow-800/50 rounded-xl px-4 py-2.5 text-sm text-yellow-400">
              ⚠ {lineupNotice}
            </div>
          )}

          {/* Tab bar */}
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <div className="flex rounded-xl overflow-hidden border border-gray-800">
              <button
                onClick={() => setActiveTab('away')}
                className={`px-4 py-2 text-sm font-semibold transition-colors ${activeTab === 'away' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}
              >
                {game.away.teamAbbrev} Batters
                <span className="ml-1.5 text-xs opacity-60">vs {homePitcher?.hand || '?'}HP</span>
              </button>
              <button
                onClick={() => setActiveTab('home')}
                className={`px-4 py-2 text-sm font-semibold transition-colors ${activeTab === 'home' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}
              >
                {game.home.teamAbbrev} Batters
                <span className="ml-1.5 text-xs opacity-60">vs {awayPitcher?.hand || '?'}HP</span>
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setSortBy(s => s === 'lineup' ? 'probability' : 'lineup')}
                className="text-xs px-3 py-2 rounded-lg border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 transition-colors"
              >
                Sort: {sortBy === 'lineup' ? 'Lineup order' : 'Hit probability ↓'}
              </button>
              <button
                onClick={handleAnalyzeAll}
                disabled={analyzeAllLoading}
                className="text-xs px-3 py-2 rounded-lg bg-indigo-900 hover:bg-indigo-800 border border-indigo-700 text-indigo-200 font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {analyzeAllLoading ? 'Analyzing...' : '✦ Analyze all'}
              </button>
            </div>
          </div>

          <SummaryBar analyses={tabAnalyses} />

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {sortedBatters.map(batter => (
              <ErrorBoundary key={batter.id}>
                <BatterCard
                  batter={batter}
                  pitcher={facingPitcher}
                  oddsLookup={oddsLookup}
                  externalAnalysis={analyses[batter.id] || null}
                  externalAnalyzing={analyzeAllLoading && !analyses[batter.id]}
                  onAnalysisComplete={handleAnalysisComplete}
                />
              </ErrorBoundary>
            ))}
            {sortedBatters.length === 0 && (
              <div className="col-span-full text-center py-10 text-gray-500">
                No batters found for this team.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
