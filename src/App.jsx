import React, { useState, useEffect } from 'react';
import Header from './components/Header.jsx';
import LandingScreen from './components/LandingScreen.jsx';
import GameGrid from './components/GameGrid.jsx';
import GameAnalysis from './components/GameAnalysis.jsx';
import SettingsModal from './components/SettingsModal.jsx';
import { cleanOldCache, loadCache, saveCache, GAMES_KEY, today } from './utils/cache.js';
import { parseGames, apiFetch } from './utils/helpers.js';

export default function App() {
  const [view, setView] = useState('landing');
  const [games, setGames] = useState([]);
  const [gamesLoading, setGamesLoading] = useState(false);
  const [gamesError, setGamesError] = useState(null);
  const [selectedGame, setSelectedGame] = useState(null);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    cleanOldCache();
  }, []);

  const handleLoadGames = async () => {
    const cacheKey = GAMES_KEY(today);
    const cached = loadCache(cacheKey);
    if (cached) {
      setGames(cached);
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
      setView('games');
    } catch (e) {
      setGamesError(e.message);
    } finally {
      setGamesLoading(false);
    }
  };

  const handleSelectGame = (game) => {
    setSelectedGame(game);
    setView('analysis');
  };

  const handleBack = () => {
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
          <LandingScreen
            onLoad={handleLoadGames}
            loading={gamesLoading}
            error={gamesError}
          />
        )}

        {view === 'games' && (
          <GameGrid games={games} onSelect={handleSelectGame} />
        )}

        {view === 'analysis' && selectedGame && (
          <GameAnalysis game={selectedGame} onBack={handleBack} />
        )}
      </main>

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  );
}
