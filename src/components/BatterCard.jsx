import React, { useState } from 'react';
import ProbabilityMeter from './ProbabilityMeter.jsx';
import { impliedProbability, formatOdds, matchOdds, apiFetch } from '../utils/helpers.js';

const REC_STYLES = {
  strong_pick:  { label: 'Strong Pick',  cls: 'bg-green-900 text-green-300 border-green-700' },
  good_value:   { label: 'Good Value',   cls: 'bg-emerald-900 text-emerald-300 border-emerald-700' },
  neutral:      { label: 'Neutral',      cls: 'bg-gray-800 text-gray-300 border-gray-600' },
  lean_avoid:   { label: 'Lean Avoid',   cls: 'bg-orange-950 text-orange-400 border-orange-800' },
  avoid:        { label: 'Avoid',        cls: 'bg-red-950 text-red-400 border-red-800' },
};

const HOT_COLD = {
  hot:      { label: '🔥 Hot',      cls: 'text-orange-400' },
  warm:     { label: '↗ Warm',      cls: 'text-yellow-400' },
  neutral:  { label: '— Neutral',   cls: 'text-gray-400' },
  cold:     { label: '↘ Cold',      cls: 'text-blue-400' },
  ice_cold: { label: '🧊 Ice Cold', cls: 'text-cyan-400' },
};

const CONF_COLORS = {
  low:    'text-gray-500',
  medium: 'text-yellow-500',
  high:   'text-green-500',
};

function GameDot({ hits }) {
  const cls =
    hits >= 2 ? 'bg-green-500' :
    hits === 1 ? 'bg-blue-500' :
    'bg-gray-700';
  return (
    <div className={`w-4 h-4 rounded-full ${cls}`} title={`${hits}H`} />
  );
}

function SplitHighlight({ label, split, active }) {
  if (!split) return null;
  return (
    <div className={`rounded-lg p-2.5 text-center border ${active ? 'border-yellow-700 bg-yellow-950/40' : 'border-gray-800 bg-gray-800/50'}`}>
      <p className={`text-xs mb-1 ${active ? 'text-yellow-400' : 'text-gray-500'}`}>{label}</p>
      <p className={`font-bold text-lg leading-none ${active ? 'text-yellow-300' : 'text-white'}`}>{split.avg}</p>
      <p className="text-xs text-gray-500 mt-0.5">
        {split.obp} OBP · {split.slg} SLG
      </p>
      <p className="text-xs text-gray-600 mt-0.5">{split.atBats} AB</p>
    </div>
  );
}

function InjuryBadge({ injury }) {
  if (!injury?.status) return null;
  const colors = {
    OUT: 'bg-red-900 text-red-300 border-red-700',
    GTD: 'bg-orange-900 text-orange-300 border-orange-700',
    'GAME TIME DECISION': 'bg-orange-900 text-orange-300 border-orange-700',
    Q:   'bg-yellow-900 text-yellow-300 border-yellow-700',
  };
  const cls = colors[injury.status.toUpperCase()] || 'bg-gray-800 text-gray-300 border-gray-600';
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded border font-semibold ${cls}`} title={injury.description || ''}>
      {injury.status}
    </span>
  );
}

function MsfPanel({ msf }) {
  if (!msf) return null;
  const { rolling, projections } = msf;
  const hasRolling = rolling?.L7 || rolling?.L14 || rolling?.L30;
  const hasProj    = projections?.projH != null;
  if (!hasRolling && !hasProj) return null;

  return (
    <div className="bg-gray-800/40 rounded-lg px-3 py-2 space-y-1.5">
      {hasProj && (
        <div className="flex items-center gap-3 text-xs">
          <span className="text-gray-500">Proj today:</span>
          <span className="font-semibold text-purple-300">
            {projections.projH?.toFixed(1)}H in {projections.projAB?.toFixed(1)}AB
          </span>
          {projections.fdPts && (
            <span className="text-gray-500">FD {projections.fdPts.toFixed(1)}pts</span>
          )}
        </div>
      )}
      {hasRolling && (
        <div className="flex items-center gap-3 text-xs flex-wrap">
          <span className="text-gray-500">Rolling AVG:</span>
          {rolling.L7  && <span className="text-gray-300">L7: <span className="font-semibold text-white">{rolling.L7.avg}</span></span>}
          {rolling.L14 && <span className="text-gray-300">L14: <span className="font-semibold text-white">{rolling.L14.avg}</span></span>}
          {rolling.L30 && <span className="text-gray-300">L30: <span className="font-semibold text-white">{rolling.L30.avg}</span></span>}
        </div>
      )}
    </div>
  );
}

export default function BatterCard({ batter, pitcher, oddsLookup, onAnalysisComplete, externalAnalysis, externalAnalyzing }) {
  const [analysis, setAnalysis] = useState(externalAnalysis || null);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(false);

  const isAnalyzing = externalAnalyzing || analyzing;
  const result = externalAnalysis || analysis;

  const pitcherHand = pitcher?.hand || 'R';
  const relevantSplitKey = pitcherHand === 'L' ? 'vsLHP' : 'vsRHP';
  const otherSplitKey = pitcherHand === 'L' ? 'vsRHP' : 'vsLHP';

  const battingOdds = matchOdds(batter.name, oddsLookup);
  const impliedProb = battingOdds ? impliedProbability(battingOdds.price) : null;

  const last5 = batter.gameLog?.slice(0, 5) || [];
  const last3 = batter.gameLog?.slice(0, 3) || [];

  const handleAnalyze = async () => {
    setAnalyzing(true);
    setError(null);
    try {
      const resp = await apiFetch('/api/analyze', {
        method: 'POST',
        body: JSON.stringify({ batter, pitcher, odds: battingOdds || null }),
      });
      if (!resp.ok) {
        const err = await resp.json();
        throw new Error(err.error || `HTTP ${resp.status}`);
      }
      const data = await resp.json();
      setAnalysis(data);
      onAnalysisComplete?.(batter.id, data);
    } catch (e) {
      setError(e.message);
    } finally {
      setAnalyzing(false);
    }
  };

  const rec = result ? REC_STYLES[result.recommendation] : null;
  const hotCold = result ? HOT_COLD[result.hotCold] : null;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <span className="text-xs bg-gray-800 border border-gray-700 px-2 py-0.5 rounded font-mono shrink-0">
            {batter.lineupOrder !== 999 ? `#${batter.lineupOrder}` : batter.position}
          </span>
          <span className="font-semibold text-white truncate">{batter.name}</span>
          <span className="text-xs text-gray-500 shrink-0">B:{batter.batSide}</span>
          <InjuryBadge injury={batter.msf?.injury} />
        </div>
        {rec && (
          <span className={`text-xs px-2 py-0.5 rounded-full border font-semibold shrink-0 ${rec.cls}`}>
            {rec.label}
          </span>
        )}
      </div>

      {/* Splits */}
      <div className="grid grid-cols-2 gap-2">
        <SplitHighlight
          label={`vs ${pitcherHand}HP (today)`}
          split={batter.splits?.[relevantSplitKey]}
          active={true}
        />
        <SplitHighlight
          label={`vs ${pitcherHand === 'L' ? 'R' : 'L'}HP`}
          split={batter.splits?.[otherSplitKey]}
          active={false}
        />
      </div>

      {/* Game dots */}
      <div className="flex items-center gap-3 flex-wrap">
        <div>
          <p className="text-xs text-gray-500 mb-1">Last 5</p>
          <div className="flex gap-1">
            {last5.length > 0 ? last5.map((g, i) => <GameDot key={i} hits={g.hits} />) : <span className="text-xs text-gray-600">—</span>}
          </div>
        </div>
        <div>
          <p className="text-xs text-gray-500 mb-1">Last 3</p>
          <div className="flex gap-1">
            {last3.length > 0 ? last3.map((g, i) => <GameDot key={i} hits={g.hits} />) : <span className="text-xs text-gray-600">—</span>}
          </div>
        </div>
      </div>

      {/* MSF rolling averages + projections */}
      <MsfPanel msf={batter.msf} />

      {/* Odds */}
      {battingOdds && (
        <div className="flex items-center gap-3 bg-gray-800/60 rounded-lg px-3 py-2">
          <div>
            <p className="text-xs text-gray-500">Hit Prop (Over 0.5)</p>
            <p className="font-bold text-white">{formatOdds(battingOdds.price)}</p>
          </div>
          <div className="text-gray-700">·</div>
          <div>
            <p className="text-xs text-gray-500">Implied</p>
            <p className="font-semibold text-gray-300">{impliedProb?.toFixed(1)}%</p>
          </div>
          <div className="text-gray-700">·</div>
          <div>
            <p className="text-xs text-gray-500">Book</p>
            <p className="text-xs text-gray-400">{battingOdds.bookmaker}</p>
          </div>
        </div>
      )}

      {/* Analysis result */}
      {result && (
        <div className="border-t border-gray-800 pt-3">
          <div className="flex items-start gap-4">
            <ProbabilityMeter value={result.hitProbability} size={80} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                {hotCold && (
                  <span className={`text-xs font-semibold ${hotCold.cls}`}>{hotCold.label}</span>
                )}
                <span className={`text-xs ${CONF_COLORS[result.confidence] || 'text-gray-400'}`}>
                  {result.confidence} confidence
                </span>
                {result.edge != null && (
                  <span className={`text-xs font-semibold ${result.edge > 0 ? 'text-green-400' : 'text-red-400'}`}>
                    Edge: {result.edge > 0 ? '+' : ''}{result.edge?.toFixed(1)}%
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-400 line-clamp-3">{result.reasoning}</p>
            </div>
          </div>

          <button
            onClick={() => setExpanded(e => !e)}
            className="mt-2 text-xs text-gray-500 hover:text-gray-300 transition-colors flex items-center gap-1"
          >
            {expanded ? '▲ Hide details' : '▼ Show key factors & full stats'}
          </button>

          {expanded && (
            <div className="mt-3 space-y-2">
              {result.keyFactors?.length > 0 && (
                <div>
                  <p className="text-xs text-gray-500 mb-1">Key Factors</p>
                  <ul className="space-y-1">
                    {result.keyFactors.map((f, i) => (
                      <li key={i} className="text-xs text-gray-300 flex gap-1.5">
                        <span className="text-gray-600 shrink-0">•</span>
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {batter.gameLog?.length > 0 && (
                <div>
                  <p className="text-xs text-gray-500 mb-1">Recent game log</p>
                  <div className="space-y-0.5">
                    {batter.gameLog.slice(0, 7).map((g, i) => (
                      <div key={i} className="flex gap-3 text-xs text-gray-400 font-mono">
                        <span className="text-gray-600 w-20">{g.date}</span>
                        <span className={g.hits > 0 ? 'text-green-400' : ''}>{g.hits}/{g.atBats}</span>
                        <span>{g.strikeOuts}K</span>
                        {g.homeRuns > 0 && <span className="text-yellow-400">{g.homeRuns}HR</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <p className="text-xs text-red-400 bg-red-950/50 rounded px-2 py-1">{error}</p>
      )}

      {/* Analyze button */}
      {!result && (
        <button
          onClick={handleAnalyze}
          disabled={isAnalyzing}
          className="w-full mt-1 py-2 rounded-lg text-sm font-semibold transition-all bg-indigo-900 hover:bg-indigo-800 border border-indigo-700 text-indigo-200 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isAnalyzing ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
              </svg>
              Analyzing...
            </span>
          ) : '✦ Analyze'}
        </button>
      )}
    </div>
  );
}
