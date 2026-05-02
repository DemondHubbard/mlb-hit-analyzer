import React from 'react';

function StatBox({ label, value, highlight }) {
  return (
    <div className={`text-center px-3 py-2 rounded-lg ${highlight ? 'bg-blue-950 border border-blue-800' : 'bg-gray-800'}`}>
      <div className={`font-bold text-sm ${highlight ? 'text-blue-300' : 'text-white'}`}>{value || '—'}</div>
      <div className="text-xs text-gray-500 mt-0.5">{label}</div>
    </div>
  );
}

function SplitRow({ label, split, highlight }) {
  if (!split) {
    return (
      <div className={`rounded-lg p-3 ${highlight ? 'bg-blue-950/30 border border-blue-900/50' : 'bg-gray-800/50'}`}>
        <p className="text-xs text-gray-500">{label}: no data</p>
      </div>
    );
  }
  return (
    <div className={`rounded-lg p-3 ${highlight ? 'bg-blue-950/30 border border-blue-900/50' : 'bg-gray-800/50'}`}>
      <p className={`text-xs font-semibold mb-2 ${highlight ? 'text-blue-400' : 'text-gray-400'}`}>{label}</p>
      <div className="grid grid-cols-4 gap-1.5 text-center">
        <div>
          <div className="text-sm font-bold text-white">{split.avg}</div>
          <div className="text-xs text-gray-500">BAA</div>
        </div>
        <div>
          <div className="text-sm font-bold text-white">{split.era}</div>
          <div className="text-xs text-gray-500">ERA</div>
        </div>
        <div>
          <div className="text-sm font-bold text-white">{split.whip}</div>
          <div className="text-xs text-gray-500">WHIP</div>
        </div>
        <div>
          <div className="text-sm font-bold text-white">{split.strikeOuts}</div>
          <div className="text-xs text-gray-500">K/{split.battersFaced}BF</div>
        </div>
      </div>
    </div>
  );
}

export default function PitcherPanel({ pitcher, label, facingHand }) {
  if (!pitcher) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <p className="text-sm text-gray-500 italic">{label}: TBD</p>
      </div>
    );
  }

  const recentLog = pitcher.gameLog?.slice(0, 3) || [];

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-xs text-gray-500 mb-0.5">{label}</p>
          <p className="font-bold text-white">{pitcher.name}</p>
        </div>
        <span className={`text-xs px-2 py-1 rounded-full font-semibold ${
          pitcher.hand === 'L' ? 'bg-purple-900 text-purple-300' : 'bg-blue-900 text-blue-300'
        }`}>
          {pitcher.hand}HP
        </span>
      </div>

      <div className="space-y-2 mb-3">
        <SplitRow
          label={`vs LHB`}
          split={pitcher.splits?.vsLHB}
          highlight={facingHand === 'L'}
        />
        <SplitRow
          label={`vs RHB`}
          split={pitcher.splits?.vsRHB}
          highlight={facingHand === 'R'}
        />
      </div>

      {recentLog.length > 0 && (
        <div>
          <p className="text-xs text-gray-500 mb-1.5">Last {recentLog.length} starts</p>
          <div className="space-y-1">
            {recentLog.map((g, i) => (
              <div key={i} className="flex items-center justify-between text-xs bg-gray-800/50 rounded px-2.5 py-1.5">
                <span className="text-gray-400">{g.date}</span>
                <span className="text-gray-300 font-mono">{g.inningsPitched}IP</span>
                <span className={`font-mono ${g.earnedRuns >= 3 ? 'text-red-400' : g.earnedRuns <= 1 ? 'text-green-400' : 'text-yellow-400'}`}>
                  {g.earnedRuns}ER
                </span>
                <span className="text-gray-400 font-mono">{g.hits}H</span>
                <span className="text-gray-400 font-mono">{g.strikeOuts}K</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
