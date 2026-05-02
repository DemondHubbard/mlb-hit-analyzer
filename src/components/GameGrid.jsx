import React from 'react';
import GameCard from './GameCard.jsx';
import { today } from '../utils/cache.js';

export default function GameGrid({ games, onSelect }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-white">Today's Games</h2>
        <span className="text-sm text-gray-500">{games.length} game{games.length !== 1 ? 's' : ''}</span>
      </div>

      {games.length === 0 ? (
        <div className="text-center py-20 text-gray-500">
          <p className="text-4xl mb-4">📭</p>
          <p>No games scheduled for {today}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {games.map(game => (
            <GameCard key={game.gamePk} game={game} onClick={onSelect} />
          ))}
        </div>
      )}
    </div>
  );
}
