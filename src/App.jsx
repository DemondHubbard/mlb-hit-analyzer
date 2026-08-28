import React, { useState, useEffect, useCallback } from 'react';
import Header from './components/Header.jsx';
import LandingScreen from './components/LandingScreen.jsx';
import GameGrid from './components/GameGrid.jsx';
import GameAnalysis from './components/GameAnalysis.jsx';
import ParlayBuilder from './components/ParlayBuilder.jsx';
import SettingsModal from './components/SettingsModal.jsx';
import { cleanOldCache, loadCache, saveCache, GAMES_KEY, ANALYSIS_KEY, today } from './utils/cache.js';
import { parseGames, apiFetch, fetchMsfPlayer } from './utils/helpers.js';
import { loadPitcher, loadBatter, getLineup } from './utils/dataFetch.js';

export default function App() {
  const [view, setView] = useState('landing');
  const [games, setGames] = useState([]);
  const [gamesLoading, setGamesLoading] = useState(false);
  const [gamesError, setGamesError] = useState(null);
  const [selectedGame, setSelectedGame] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showParlay, setShowParlay] = useState(false);

  const [globalRunning, setGlobalRunning] = useState(false);
  const [globalProgress, setGlobalProgress] = useState(null);
  const [analysisStatus, setAnalysisStatus] = useState({});

  useEffect(() => { cleanOldCache(); }, []);

  const refreshAnalysisStatus = useCallback((gameList) => {
    const status = {};
    for (const g of gameList) {
      const cached = loadCache(ANALYSIS_KEY(g.gamePk, today));
      status[g.gamePk] = cached ? Object.keys(cached).length : 0;
    }
    setAnalysisStatus(status);
  }, []);

  const handleLoadGames = async () => {
    const cacheKey = GAMES_KEY(today);
    const cached = loadCache(cacheKey);
    if (cached) {
      setGames(cached);
      refreshAnalysisStatus(cached);
      setView('games');
      return;
    }

    setGamesLoading(true);
    setGamesError(null);
    try {
      const resp = await apiFetch(
        `/api/mlb/schedule?sportId=1&date=${today}&hydrate=probablePitcher,team`
      );
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${resp.status}`);
      }
      const data = await resp.json();
      const parsed = parseGames(data);
      saveCache(cacheKey, parsed);
      setGames(parsed);
      refreshAnalysisStatus(parsed);
      setView('games');
    } catch (e) {
      setGamesError(e.message);
    } finally {
      setGamesLoading(false);
    }
  };

  const handleGlobalAnalyze = async () => {
    if (globalRunning || !games.length) return;
    setGlobalRunning(true);
    setGlobalProgress({ phase: 'checking', done: 0, total: games.length });

    // Phase 1 — find games with confirmed live lineups
    const gamesWithLineups = [];
    let checked = 0;

    for (const game of games) {
      const [awayLineup, homeLineup] = await Promise.all([
        getLineup(game.gamePk, game.away.teamId, false),
        getLineup(game.gamePk, game.home.teamId, true),
      ]);
      checked++;
      setGlobalProgress({ phase: 'checking', done: checked, total: games.length });

      if (awayLineup.fromLive || homeLineup.fromLive) {
        gamesWithLineups.push({ game, awayLineup, homeLineup });
      }
    }

    if (!gamesWithLineups.length) {
      setGlobalRunning(false);
      setGlobalProgress({ phase: 'done', noLineups: true, gamesChecked: games.length });
      return;
    }

    // Build list of batters not yet analyzed — only confirmed live lineups (smart skip)
    const toAnalyze = [];
    for (const { game, awayLineup, homeLineup } of gamesWithLineups) {
      const cached = loadCache(ANALYSIS_KEY(game.gamePk, today)) || {};
      if (awayLineup.fromLive) {
        for (const stub of awayLineup.batters.slice(0, 9)) {
          if (!cached[stub.id]) {
            toAnalyze.push({ stub, game, isHome: false, opponentPitcherId: game.home.pitcher?.id });
          }
        }
      }
      if (homeLineup.fromLive) {
        for (const stub of homeLineup.batters.slice(0, 9)) {
          if (!cached[stub.id]) {
            toAnalyze.push({ stub, game, isHome: true, opponentPitcherId: game.away.pitcher?.id });
          }
        }
      }
    }

    if (!toAnalyze.length) {
      setGlobalRunning(false);
      setGlobalProgress({ phase: 'done', allCached: true, games: gamesWithLineups.length });
      refreshAnalysisStatus(games);
      return;
    }

    // Pre-load all pitchers in parallel (deduped by ID)
    const pitcherJobs = {};
    for (const { game } of gamesWithLineups) {
      if (game.away.pitcher?.id && !pitcherJobs[game.away.pitcher.id])
        pitcherJobs[game.away.pitcher.id] = loadPitcher(game.away.pitcher, game.away.teamId);
      if (game.home.pitcher?.id && !pitcherJobs[game.home.pitcher.id])
        pitcherJobs[game.home.pitcher.id] = loadPitcher(game.home.pitcher, game.home.teamId);
    }
    const pitcherEntries = await Promise.all(
      Object.entries(pitcherJobs).map(async ([id, p]) => [id, await p])
    );
    const pitcherMap = Object.fromEntries(pitcherEntries);

    // Phase 2 — analyze each new batter sequentially
    setGlobalProgress({ phase: 'analyzing', done: 0, total: toAnalyze.length, current: '' });
    let done = 0;

    for (const { stub, game, isHome, opponentPitcherId } of toAnalyze) {
      setGlobalProgress({
        phase: 'analyzing',
        done,
        total: toAnalyze.length,
        current: `${stub.name || 'Batter'} — ${game.away.teamAbbrev} @ ${game.home.teamAbbrev}`,
      });

      try {
        const pitcher = opponentPitcherId ? pitcherMap[opponentPitcherId] ?? null : null;
        const batter = await loadBatter(stub, opponentPitcherId);
        if (batter) {
          const msf = stub.name ? await fetchMsfPlayer(stub.name).catch(() => null) : null;
          const resp = await apiFetch('/api/analyze', {
            method: 'POST',
            body: JSON.stringify({
              batter: { ...batter, msf: msf || null },
              pitcher,
              odds: null,
              gameContext: { isHome, venue: game.venue },
            }),
          });
          if (resp.ok) {
            const data = await resp.json();
            const existing = loadCache(ANALYSIS_KEY(game.gamePk, today)) || {};
            existing[batter.id] = { ...data, _name: batter.name };
            saveCache(ANALYSIS_KEY(game.gamePk, today), existing);
          }
        }
      } catch { /* skip this batter, move on */ }

      done++;
    }

    refreshAnalysisStatus(games);
    setGlobalRunning(false);
    setGlobalProgress({ phase: 'done', done, games: gamesWithLineups.length });
  };

  const handleSelectGame = (game) => {
    setSelectedGame(game);
    setView('analysis');
  };

  const handleBack = () => {
    refreshAnalysisStatus(games);
    setView('games');
    setSelectedGame(null);
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Header
        onSettings={() => setShowSettings(true)}
        onLogoClick={() => setView(view === 'landing' ? 'landing' : 'games')}
      />

      <main className="container mx-auto px-4 py-6 max-w-7xl">
        {view === 'landing' && (
          <LandingScreen onLoad={handleLoadGames} loading={gamesLoading} error={gamesError} />
        )}

        {view === 'games' && (
          <GameGrid
            games={games}
            onSelect={handleSelectGame}
            onGlobalAnalyze={handleGlobalAnalyze}
            globalRunning={globalRunning}
            globalProgress={globalProgress}
            analysisStatus={analysisStatus}
            onOpenParlay={() => setShowParlay(true)}
          />
        )}

        {view === 'analysis' && selectedGame && (
          <GameAnalysis game={selectedGame} onBack={handleBack} />
        )}
      </main>

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      {showParlay && <ParlayBuilder games={games} onClose={() => setShowParlay(false)} />}
    </div>
  );
}
