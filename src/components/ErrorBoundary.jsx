import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="bg-red-950 border border-red-800 rounded-xl p-4 text-sm">
          <p className="text-red-400 font-semibold mb-1">Failed to load player</p>
          <p className="text-red-500 text-xs font-mono">{this.state.error?.message}</p>
        </div>
      );
    }
    return this.props.children;
  }
}
