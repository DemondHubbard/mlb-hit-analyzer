import React, { useState, useEffect, useMemo } from 'react';
import { loadCache, ANALYSIS_KEY, today } from '../utils/cache.js';

const REC_STYLES = {
  strong_pick: { label: 'Strong Pick', cls: 'bg-green-900 text-green-300 border-green-700' },
  good_value:  { label: 'Good Value',  cls: 'bg-emerald-900 text-emerald-300 border-emerald-700' },
};

export default function ParlayBuilder({ games, onClose }) {
  const [selected, setSelected] = useState(new Set());
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const allPicks = useMemo(() => {
    const picks = [];
    for (const game of games) {
      const analyses = loadCache(ANALYSIS_KEY(game.gamePk, today));
      if (!analyses) continue;
      for (const [id, analysis] of Object.entries(analyses)) {
        if (!['strong_pick', 'good_value'].includes(analysis.recommendation)) continue;
        picks.push({
          key: `${game.gamePk}_${id}`,
          gamePk: game.gamePk,
          playerId: id,
          name: analysis._name || 'Unknown',
          game: `${game.away.teamAbbrev} @ ${game.home.teamAbbrev}`,
          gameDate: game.gameDate,
          hitProbability: analysis.hitProbability || 0,
          recommendation: analysis.recommendation,
          confidence: analysis.confidence,
          edge: analysis.edge,
        });
      }
    }
    return picks.sort((a, b) => b.hitProbability - a.hitProbability);
  }, [games]);

  const togglePick = (key) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else if (next.size < 6) {
        next.add(key);
      }
      return next;
    });
  };

  const selectedPicks = allPicks.filter(p => selected.has(p.key));
  const combinedProb = selectedPicks.length >= 2
    ? selectedPicks.reduce((acc, p) => acc * (p.hitProbability / 100), 1) * 100
    : null;

  const handleCopy = () => {
    const date = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const lines = [
      `MLB Hit Parlay — ${date}`,
      '',
      ...selectedPicks.map((p, i) =>
        `${i + 1}. ${p.name} (${p.game}) — ${p.hitProbability}% hit prob`
      ),
      '',
      `Combined probability: ${combinedProb?.toFixed(1)}%`,
    ];
    navigator.clipboard.writeText(lines.join('\n')).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-gray-950 border border-gray-800 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-2xl max-h-[85vh] flex flex-col shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-800">
          <div>
            <h3 className="text-lg font-bold text-white">🎯 Parlay Builder</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {allPicks.length > 0
                ? `${allPicks.length} strong/value pick${allPicks.length !== 1 ? 's' : ''} — select 2–6 to build your slip`
                : 'Select 2–6 picks to build your slip'
              }
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:text-white hover:bg-gray-800 transition-colors text-xl leading-none"
          >
            &times;
          </button>
        </div>

        {/* Picks list */}
        <div className="overflow-y-auto flex-1 p-4 space-y-2">
          {allPicks.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <p className="text-4xl mb-3">📊</p>
              <p className="text-sm">No strong or value picks analyzed yet.</p>
              <p className="text-xs text-gray-600 mt-1">Run "Analyze All Games" first, then come back here.</p>
            </div>
          ) : (
            allPicks.map(pick => {
              const isSelected = selected.has(pick.key);
              const canSelect = isSelected || selected.size < 6;
              const recStyle = REC_STYLES[pick.recommendation];

              return (
                <button
                  key={pick.key}
                  onClick={() => canSelect && togglePick(pick.key)}
                  disabled={!canSelect}
                  className={`w-full flex items-center gap-3 rounded-xl px-4 py-3 text-left transition-all border ${
                    isSelected
                      ? 'bg-indigo-950 border-indigo-600 shadow-lg shadow-indigo-900/20'
                      : canSelect
                        ? 'bg-gray-900 border-gray-800 hover:border-gray-600 hover:bg-gray-800'
                        : 'bg-gray-900 border-gray-800 opacity-40 cursor-not-allowed'
                  }`}
                >
                  {/* Checkbox */}
                  <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-all ${isSelected ? 'bg-indigo-600 border-indigo-500' : 'border-gray-600'}`}>
                    {isSelected && (
                      <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none">
                        <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </div>

                  {/* Hit probability bubble */}
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 text-sm font-bold leading-none ${
                    pick.hitProbability >= 65 ? 'bg-green-900 text-green-300' :
                    pick.hitProbability >= 55 ? 'bg-yellow-900 text-yellow-300' :
                    'bg-gray-800 text-gray-300'
                  }`}>
                    {pick.hitProbability}%
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-white text-sm">{pick.name}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded border font-semibold ${recStyle.cls}`}>
                        {recStyle.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5 flex-wrap">
                      <span>{pick.game}</span>
                      {pick.edge != null && (
                        <span className={pick.edge > 0 ? 'text-green-400' : 'text-red-400'}>
                          Edge {pick.edge > 0 ? '+' : ''}{pick.edge?.toFixed(1)}%
                        </span>
                      )}
                      <span className={
                        pick.confidence === 'high' ? 'text-green-500 capitalize' :
                        pick.confidence === 'medium' ? 'text-yellow-500 capitalize' :
                        'text-gray-600 capitalize'
                      }>
                        {pick.confidence} conf
                      </span>
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Parlay slip */}
        {selectedPicks.length >= 1 && (
          <div className="border-t border-gray-800 p-4 bg-gray-900/60">
            {selectedPicks.length < 2 ? (
              <p className="text-sm text-gray-500 text-center">
                Select {2 - selectedPicks.length} more pick to complete your parlay.
              </p>
            ) : (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-sm font-bold text-white">{selectedPicks.length}-Leg Parlay</p>
                    <p className="text-xs text-gray-500">All legs hit probability</p>
                  </div>
                  <p className="text-2xl font-bold text-indigo-400">{combinedProb?.toFixed(1)}%</p>
                </div>

                <div className="space-y-1 mb-3 bg-gray-800/50 rounded-lg p-3">
                  {selectedPicks.map((p, i) => (
                    <div key={p.key} className="flex items-center gap-2 text-xs text-gray-400">
                      <span className="text-gray-600 w-4 shrink-0">{i + 1}.</span>
                      <span className="font-semibold text-white truncate">{p.name}</span>
                      <span className="text-gray-600 shrink-0">·</span>
                      <span className="text-gray-500 shrink-0">{p.game}</span>
                      <span className="ml-auto text-green-400 font-semibold shrink-0">{p.hitProbability}%</span>
                    </div>
                  ))}
                </div>

                <button
                  onClick={handleCopy}
                  className="w-full py-2.5 rounded-lg bg-indigo-700 hover:bg-indigo-600 text-white font-semibold text-sm transition-colors"
                >
                  {copied ? '✓ Copied to clipboard!' : 'Copy Parlay Slip'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
