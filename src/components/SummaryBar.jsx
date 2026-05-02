import React from 'react';

export default function SummaryBar({ analyses }) {
  const results = Object.values(analyses);
  if (results.length < 2) return null;

  const avgProb = Math.round(results.reduce((s, r) => s + (r.hitProbability || 0), 0) / results.length);
  const strongPicks = results.filter(r => r.recommendation === 'strong_pick').length;
  const goodValue = results.filter(r => r.recommendation === 'good_value').length;
  const avoid = results.filter(r => ['lean_avoid', 'avoid'].includes(r.recommendation)).length;

  const top3 = [...results]
    .sort((a, b) => b.hitProbability - a.hitProbability)
    .slice(0, 3);

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl p-4 mb-4">
      <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider mb-3">
        Analysis Summary — {results.length} players
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
        <div className="text-center bg-gray-800 rounded-lg px-3 py-2">
          <p className="text-xl font-bold text-white">{avgProb}%</p>
          <p className="text-xs text-gray-500">Avg Hit Prob</p>
        </div>
        <div className="text-center bg-green-950/60 border border-green-900/50 rounded-lg px-3 py-2">
          <p className="text-xl font-bold text-green-400">{strongPicks + goodValue}</p>
          <p className="text-xs text-gray-500">Strong / Value</p>
        </div>
        <div className="text-center bg-red-950/40 border border-red-900/30 rounded-lg px-3 py-2">
          <p className="text-xl font-bold text-red-400">{avoid}</p>
          <p className="text-xs text-gray-500">Avoid</p>
        </div>
        <div className="text-center bg-gray-800 rounded-lg px-3 py-2">
          <p className="text-xl font-bold text-yellow-400">{results.length}</p>
          <p className="text-xs text-gray-500">Analyzed</p>
        </div>
      </div>

      <div>
        <p className="text-xs text-gray-500 mb-1.5">Top picks by probability</p>
        <div className="flex flex-wrap gap-2">
          {top3.map((r, i) => (
            <div key={i} className="flex items-center gap-1.5 bg-gray-800 rounded-lg px-2.5 py-1.5">
              <span className="text-xs text-gray-500">{i + 1}.</span>
              <span className="text-xs font-semibold text-white">{r._name || '?'}</span>
              <span className="text-xs font-bold text-green-400">{r.hitProbability}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
