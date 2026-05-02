import React, { useState, useEffect } from 'react';
import { apiFetch } from '../utils/helpers.js';

export default function SettingsModal({ onClose }) {
  const [oddsKey, setOddsKey] = useState('');
  const [anthropicKey, setAnthropicKey] = useState('');
  const [health, setHealth] = useState(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setOddsKey(localStorage.getItem('odds_api_key') || '');
    setAnthropicKey(localStorage.getItem('anthropic_api_key') || '');

    apiFetch('/api/health')
      .then(r => r.json())
      .then(setHealth)
      .catch(() => {});
  }, []);

  const handleSave = () => {
    if (oddsKey.trim()) localStorage.setItem('odds_api_key', oddsKey.trim());
    else localStorage.removeItem('odds_api_key');

    if (anthropicKey.trim()) localStorage.setItem('anthropic_api_key', anthropicKey.trim());
    else localStorage.removeItem('anthropic_api_key');

    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const StatusBadge = ({ configured }) => (
    <span className={`text-xs px-2 py-0.5 rounded-full ${configured ? 'bg-green-900 text-green-400' : 'bg-red-950 text-red-400'}`}>
      {configured ? 'Configured' : 'Missing'}
    </span>
  );

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-white">Settings</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors p-1">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {health && (
          <div className="mb-5 bg-gray-800 rounded-xl p-3 space-y-2">
            <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Server Status</p>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-300">Odds API</span>
              <StatusBadge configured={health.hasOddsKey} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-300">Anthropic API</span>
              <StatusBadge configured={health.hasAnthropicKey} />
            </div>
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              Odds API Key
              <a
                href="https://the-odds-api.com"
                target="_blank"
                rel="noopener noreferrer"
                className="ml-2 text-xs text-blue-400 hover:text-blue-300"
              >
                Get key →
              </a>
            </label>
            <input
              type="password"
              value={oddsKey}
              onChange={e => setOddsKey(e.target.value)}
              placeholder="Overrides ODDS_API_KEY env var"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-600"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              Anthropic API Key
              <a
                href="https://console.anthropic.com"
                target="_blank"
                rel="noopener noreferrer"
                className="ml-2 text-xs text-blue-400 hover:text-blue-300"
              >
                Get key →
              </a>
            </label>
            <input
              type="password"
              value={anthropicKey}
              onChange={e => setAnthropicKey(e.target.value)}
              placeholder="Overrides ANTHROPIC_API_KEY env var"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-600"
            />
          </div>
        </div>

        <p className="text-xs text-gray-600 mt-3">
          Keys entered here are stored in browser localStorage and sent as request headers. They override server-side env vars.
        </p>

        <div className="flex gap-3 mt-5">
          <button
            onClick={handleSave}
            className="flex-1 bg-blue-700 hover:bg-blue-600 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors"
          >
            {saved ? '✓ Saved' : 'Save'}
          </button>
          <button
            onClick={onClose}
            className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 font-semibold py-2.5 rounded-xl text-sm transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
