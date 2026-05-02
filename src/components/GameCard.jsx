import React from 'react';
import { formatTime } from '../utils/helpers.js';

const STATUS_COLORS = {
  'Final': 'text-gray-500',
  'In Progress': 'text-green-400',
  'Live': 'text-green-400',
  'Scheduled': 'text-blue-400',
  'Pre-Game': 'text-yellow-400',
  'Warmup': 'text-yellow-400',
  'Postponed': 'text-red-400',
};

export default function GameCard({ game, onClick }) {
  const statusColor = STATUS_COLORS[game.status] || 'text-gray-400';

  return (
    <button
      onClick={() => onClick(game)}
      className="w-full bg-gray-900 hover:bg-gray-800 border border-gray-800 hover:border-gray-600 rounded-xl p-5 text-left transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/20 group"
    >
      <div className="flex items-center justify-between mb-4 text-xs">
        <span className={`font-medium ${statusColor}`}>{game.status}</span>
        <span className="text-gray-500">{formatTime(game.gameDate)}</span>
      </div>

      <div className="flex items-center gap-3">
        {/* Away team */}
        <div className="flex-1 min-w-0">
          <p className="font-bold text-white text-sm truncate">{game.away.teamName}</p>
          <p className="text-xs text-gray-500 truncate mt-0.5">
            {game.away.pitcher?.name || <span className="italic">TBD</span>}
          </p>
        </div>

        <div className="text-gray-600 font-bold text-sm shrink-0 group-hover:text-gray-400 transition-colors">@</div>

        {/* Home team */}
        <div className="flex-1 min-w-0 text-right">
          <p className="font-bold text-white text-sm truncate">{game.home.teamName}</p>
          <p className="text-xs text-gray-500 truncate mt-0.5">
            {game.home.pitcher?.name || <span className="italic">TBD</span>}
          </p>
        </div>
      </div>

      {game.venue && (
        <p className="text-xs text-gray-600 mt-3 truncate">{game.venue}</p>
      )}
    </button>
  );
}
