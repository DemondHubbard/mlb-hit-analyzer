import React from 'react';
import { formatDate } from '../utils/helpers.js';
import { today } from '../utils/cache.js';

export default function LandingScreen({ onLoad, loading, error }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] text-center px-4">
      <div className="mb-8">
        <div className="text-6xl mb-6">⚾</div>
        <h1 className="text-4xl sm:text-5xl font-bold text-white mb-3 tracking-tight">
          MLB Hit Analyzer
        </h1>
        <p className="text-gray-400 text-lg max-w-md">
          MLB hit prop analyzer — powered by live stats + AI
        </p>
        <p className="text-gray-500 text-sm mt-2">{formatDate(today)}</p>
      </div>

      {error && (
        <div className="mb-6 bg-red-950 border border-red-800 rounded-xl px-6 py-4 max-w-md w-full text-left">
          <p className="text-red-400 font-semibold text-sm mb-1">Failed to load games</p>
          <p className="text-red-500 text-xs font-mono">{error}</p>
        </div>
      )}

      <button
        onClick={onLoad}
        disabled={loading}
        className="bg-green-600 hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold px-10 py-4 rounded-2xl text-lg transition-all shadow-lg shadow-green-900/30 hover:shadow-green-800/40 hover:-translate-y-0.5 active:translate-y-0"
      >
        {loading ? (
          <span className="flex items-center gap-2">
            <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
            Loading games...
          </span>
        ) : (
          'Load today\'s games'
        )}
      </button>

      <div className="mt-16 grid grid-cols-3 gap-8 text-center max-w-lg">
        <div>
          <div className="text-2xl mb-2">📊</div>
          <p className="text-gray-500 text-xs">Live MLB Stats API</p>
        </div>
        <div>
          <div className="text-2xl mb-2">💰</div>
          <p className="text-gray-500 text-xs">Real-time odds</p>
        </div>
        <div>
          <div className="text-2xl mb-2">🤖</div>
          <p className="text-gray-500 text-xs">Claude AI analysis</p>
        </div>
      </div>
    </div>
  );
}
