import React from 'react';

function Shimmer({ className }) {
  return (
    <div className={`animate-pulse bg-gray-800 rounded ${className}`} />
  );
}

export function GameCardSkeleton() {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <Shimmer className="h-3 w-20" />
        <Shimmer className="h-3 w-16" />
      </div>
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1 space-y-2">
          <Shimmer className="h-5 w-32" />
          <Shimmer className="h-3 w-24" />
        </div>
        <Shimmer className="h-6 w-6 rounded-full" />
        <div className="flex-1 space-y-2 text-right">
          <Shimmer className="h-5 w-32 ml-auto" />
          <Shimmer className="h-3 w-24 ml-auto" />
        </div>
      </div>
    </div>
  );
}

export function BatterCardSkeleton() {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Shimmer className="h-5 w-8 rounded" />
        <Shimmer className="h-5 w-28" />
        <Shimmer className="h-4 w-12" />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Shimmer className="h-10 rounded-lg" />
        <Shimmer className="h-10 rounded-lg" />
        <Shimmer className="h-10 rounded-lg" />
      </div>
      <div className="flex gap-1.5">
        {[...Array(5)].map((_, i) => (
          <Shimmer key={i} className="h-5 w-5 rounded-full" />
        ))}
      </div>
    </div>
  );
}

export function PitcherSkeleton() {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
      <Shimmer className="h-5 w-32" />
      <div className="grid grid-cols-2 gap-3">
        <Shimmer className="h-16 rounded-lg" />
        <Shimmer className="h-16 rounded-lg" />
      </div>
    </div>
  );
}
