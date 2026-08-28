import React, { useState, useCallback, useEffect } from 'react';
import PitcherPanel from './PitcherPanel.jsx';
import BatterCard from './BatterCard.jsx';
import SummaryBar from './SummaryBar.jsx';
import ErrorBoundary from './ErrorBoundary.jsx';
import { BatterCardSkeleton } from './LoadingSkeletons.jsx';
import { formatTime, apiFetch, fetchMsfPlayer } from '../utils/helpers.js';
import {
  loadCache, saveCache, ANALYSIS_KEY, today,
} from '../utils/cache.js';
import { loadPitcher, loadBatter, getLineup } from '../utils/dataFetch.js';

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

  // Restore persisted analyses on mount
  useEffect(() => {
    const cached = loadCache(ANALYSIS_KEY(game.gamePk, today));
    if (cached && Object.keys(cached).length > 0) setAnalyses(cached);
  }, [game.gamePk]);

  // Persist analyses whenever they change
  useEffect(() => {
    if (Object.keys(analyses).length > 0) {
      saveCache(ANALYSIS_KEY(game.gamePk, today), analyses);
    }
  }, [analyses, game.gamePk]);

  const handleLoad = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [awayP, homeP, awayLineup, homeLineup, oddsResp] = await Promise.all([
        loadPitcher(game.away.pitcher, game.away.teamId),
        loadPitcher(game.home.pitcher, game.home.teamId),
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

      const awayStubs = awayLineup.batters.slice(0, 9);
      const homeStubs = homeLineup.batters.slice(0, 9);

      // Load MLB stats + MSF in parallel; pass opposing pitcher ID for career H2H
      const [mlbAwayBatters, mlbHomeBatters, awayMsf, homeMsf] = await Promise.all([
        Promise.all(awayStubs.map(s => loadBatter(s, homeP?.id))),
        Promise.all(homeStubs.map(s => loadBatter(s, awayP?.id))),
        Promise.all(awayStubs.map(s => s.name ? fetchMsfPlayer(s.name) : Promise.resolve(null))),
        Promise.all(homeStubs.map(s => s.name ? fetchMsfPlayer(s.name) : Promise.resolve(null))),
      ]);

      setAwayBatters(mlbAwayBatters.map((b, i) => b ? { ...b, msf: awayMsf[i] || null } : null).filter(Boolean));
      setHomeBatters(mlbHomeBatters.map((b, i) => b ? { ...b, msf: homeMsf[i] || null } : null).filter(Boolean));
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
    const gameCtx = { venue: game.venue, isHome: activeTab === 'home' };
    for (const batter of unanalyzed) {
      try {
        const resp = await apiFetch('/api/analyze', {
          method: 'POST',
          body: JSON.stringify({ batter, pitcher, odds: null, gameContext: gameCtx }),
        });
        if (resp.ok) {
          const data = await resp.json();
          setAnalyses(prev => {
            const updated = { ...prev, [batter.id]: { ...data, _name: batter.name } };
            saveCache(ANALYSIS_KEY(game.gamePk, today), updated);
            return updated;
          });
        }
      } catch { /* skip */ }
    }
    setAnalyzeAllLoading(false);
  };

  const tabBatters = activeTab === 'away' ? awayBatters : homeBatters;
  const facingPitcher = activeTab === 'away' ? homePitcher : awayPitcher;

  const sortedBatters = [...tabBatters].sort((a, b) => {
    if (sortBy === 'probability') {
      return (analyses[b.id]?.hitProbability ?? -1) - (analyses[a.id]?.hitProbability ?? -1);
    }
    return (a.lineupOrder ?? 999) - (b.lineupOrder ?? 999);
  });

  const tabAnalyses = Object.fromEntries(
    Object.entries(analyses).filter(([id]) => tabBatters.some(b => b.id === Number(id)))
  );

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
            <PitcherPanel pitcher={awayPitcher} label={`${game.away.teamAbbrev} SP`} facingHand={homePitcher?.hand} />
            <PitcherPanel pitcher={homePitcher} label={`${game.home.teamAbbrev} SP`} facingHand={awayPitcher?.hand} />
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

      {/* Load button */}
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
          <p className="text-xs text-gray-600 mt-3">Fetches 2024–2026 splits + game log for each player</p>
        </div>
      )}

      {loading && (
        <div className="text-center py-8">
          <div className="inline-flex items-center gap-3 text-gray-400">
            <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
            Loading 3 seasons of splits + game log...
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
                  isHome={activeTab === 'home'}
                  venue={game.venue}
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
