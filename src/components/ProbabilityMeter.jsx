import React from 'react';

export default function ProbabilityMeter({ value, size = 96 }) {
  const radius = size * 0.38;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * radius;
  const filled = circumference - (value / 100) * circumference;

  const color =
    value >= 75 ? '#22c55e' :
    value >= 65 ? '#84cc16' :
    value >= 55 ? '#eab308' :
    value >= 45 ? '#f97316' :
    '#ef4444';

  const trackColor = '#1f2937';

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={cx} cy={cy} r={radius} fill="none" stroke={trackColor} strokeWidth={size * 0.09} />
        <circle
          cx={cx} cy={cy} r={radius}
          fill="none"
          stroke={color}
          strokeWidth={size * 0.09}
          strokeDasharray={circumference}
          strokeDashoffset={filled}
          strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cy})`}
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-bold leading-none" style={{ color, fontSize: size * 0.22 }}>{value}%</span>
      </div>
    </div>
  );
}
