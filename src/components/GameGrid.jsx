import React from 'react';
import GameCard from './GameCard.jsx';
import { today } from '../utils/cache.js';

export default function GameGrid({ games, onSelect, onGlobalAnalyze, globalRunning, globalProgress, analysisStatus, onOpenParlay }) {
  const totalAnalyzed = Object.values(analysisStatus).reduce((s, n) => s + n, 0);

  const progressLabel = () => {
    if (!globalProgress) return '';
    if (globalProgress.phase === 'checking')
      return `Checking lineups… ${globalProgress.done}/${globalProgress.total} games`;
    if (globalProgress.phase === 'analyzing')
      return `Analyzing: ${globalProgress.current} (${globalProgress.done}/${globalProgress.total})`;
    return '';
  };

  const progressPct = () => {
    if (!globalProgress || globalProgress.phase === 'done') return 100;
    const { done = 0, total = 1 } = globalProgress;
    return total > 0 ? (done / total) * 100 : 0;
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-white">Today's Games</h2>
          <p className="text-sm text-gray-500">{games.length} game{games.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {totalAnalyzed > 0 && (
            <button
              onClick={onOpenParlay}
              className="text-sm px-4 py-2 rounded-xl bg-purple-900 hover:bg-purple-800 border border-purple-700 text-purple-200 font-semibold transition-colors"
            >
              🎯 Parlay Builder
            </button>
          )}
          <button
            onClick={onGlobalAnalyze}
            disabled={globalRunning || !games.length}
            className="text-sm px-4 py-2 rounded-xl bg-indigo-900 hover:bg-indigo-800 border border-indigo-700 text-indigo-200 font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {globalRunning ? '⟳ Analyzing…' : '✦ Analyze All Games'}
          </button>
        </div>
      </div>

      {/* Progress / done banner */}
      {(globalRunning || globalProgress?.phase === 'done') && (
        <div className="mb-5 bg-gray-900 border border-gray-800 rounded-xl p-4">
          {globalProgress?.phase !== 'done' ? (
            <div>
              <div className="flex justify-between text-xs text-gray-400 mb-2">
                <span className="truncate">{progressLabel()}</span>
              </div>
              <div className="bg-gray-800 rounded-full h-1.5">
                <div
                  className="bg-indigo-500 h-1.5 rounded-full transition-all duration-300"
                  style={{ width: `${progressPct()}%` }}
                />
              </div>
            </div>
          ) : (
            <p className="text-sm">
              {globalProgress.noLineups
                ? <span className="text-yellow-400">⚠ No confirmed lineups found across {globalProgress.gamesChecked} games yet. Try again closer to first pitch.</span>
                : globalProgress.allCached
                  ? <span className="text-green-400">✓ All batters for {globalProgress.games} game{globalProgress.games !== 1 ? 's' : ''} already analyzed — nothing new to run.</span>
                  : <span className="text-green-400">✓ Analyzed {globalProgress.done} batter{globalProgress.done !== 1 ? 's' : ''} across {globalProgress.games} game{globalProgress.games !== 1 ? 's' : ''}.</span>
              }
            </p>
          )}
        </div>
      )}

      {games.length === 0 ? (
        <div className="text-center py-20 text-gray-500">
          <p className="text-4xl mb-4">📭</p>
          <p>No games scheduled for {today}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {games.map(game => (
            <GameCard
              key={game.gamePk}
              game={game}
              onClick={onSelect}
              analyzedCount={analysisStatus[game.gamePk] || 0}
            />
          ))}
        </div>
      )}
    </div>
  );
}
