import React from 'react';

export function Header({ pipelineStatus, onAbort }) {
  return (
    <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-cyan-400 flex items-center justify-center font-black text-xl shadow-lg shadow-indigo-500/25">
            SW
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
              StreamWeaver
            </h1>
            <p className="text-xs text-indigo-400 font-medium">High-Throughput No-Code ETL Pipeline</p>
          </div>
        </div>

        {/* Engine Features & Abort Action */}
        <div className="flex items-center space-x-4">
          <div className="hidden md:flex items-center space-x-2 text-xs bg-slate-800/80 border border-slate-700/80 rounded-full px-3 py-1 text-slate-300">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>Node.js Streams: Native Transform</span>
            <span className="text-slate-600">|</span>
            <span>Sandbox: isolated-vm</span>
            <span className="text-slate-600">|</span>
            <span>Sink: bulkWrite(1000)</span>
          </div>

          {pipelineStatus === 'running' && (
            <button
              onClick={onAbort}
              className="px-3 py-1 text-xs font-semibold rounded-lg bg-rose-500/20 text-rose-300 border border-rose-500/30 hover:bg-rose-500/30 transition"
            >
              Abort Pipeline
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
export default Header;
