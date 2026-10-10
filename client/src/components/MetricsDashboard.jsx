import React from 'react';

/**
 * Real-Time Telemetry & Progress Dashboard.
 * Visualizes throughput, strictly bounded V8 heap memory usage, and stream progress.
 */
export function MetricsDashboard({ metrics, status, onAbort }) {
  const {
    processedRows = 0,
    quarantinedRows = 0,
    committedRows = 0,
    totalBatches = 0,
    totalRows = 0,
    progressPct = 0,
    throughput = 0,
    elapsedSeconds = 0,
    etaSeconds = 0,
    memory = {}
  } = metrics || {};

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-5">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400">
            Pipeline Execution & Telemetry
          </h2>
          <p className="text-xs text-slate-400">
            Real-time SSE monitoring with strictly bounded V8 heap memory consumption.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <span className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase ${
            status === 'running' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse' :
            status === 'completed' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' :
            status === 'error' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40' :
            'bg-slate-800 text-slate-400 border border-slate-700'
          }`}>
            {status}
          </span>

          {status === 'running' && (
            <button
              onClick={onAbort}
              className="px-3 py-1 text-xs font-semibold rounded-lg bg-rose-500/20 text-rose-300 border border-rose-500/30 hover:bg-rose-500/30 transition"
            >
              Abort
            </button>
          )}
        </div>
      </div>

      {/* Progress Bar */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-slate-300">
            Processed: <span className="font-mono text-indigo-400 font-bold">{processedRows.toLocaleString()}</span> / {totalRows ? totalRows.toLocaleString() : 'Estimating...'} rows
          </span>
          <span className="font-mono text-indigo-300 font-bold">{progressPct}%</span>
        </div>
        <div className="w-full h-3 rounded-full bg-slate-950 overflow-hidden border border-slate-800">
          <div
            className="h-full bg-gradient-to-r from-indigo-600 via-indigo-500 to-cyan-400 transition-all duration-200"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Metric KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
          <div className="text-[11px] font-bold uppercase text-slate-400">Throughput</div>
          <div className="mt-1 font-mono text-xl font-black text-cyan-400">
            {throughput.toLocaleString()} <span className="text-xs text-slate-400 font-normal">rows/s</span>
          </div>
        </div>

        <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
          <div className="text-[11px] font-bold uppercase text-slate-400">Batches Committed</div>
          <div className="mt-1 font-mono text-xl font-black text-emerald-400">
            {totalBatches.toLocaleString()} <span className="text-xs text-slate-400 font-normal">({committedRows.toLocaleString()})</span>
          </div>
        </div>

        <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
          <div className="text-[11px] font-bold uppercase text-slate-400">V8 Heap Used</div>
          <div className="mt-1 font-mono text-xl font-black text-amber-400">
            {memory.heapUsedMb || 0} <span className="text-xs text-slate-400 font-normal">MB</span>
          </div>
          <div className="text-[10px] text-slate-400 font-mono mt-0.5">
            RSS: {memory.rssMb || 0} MB
          </div>
        </div>

        <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
          <div className="text-[11px] font-bold uppercase text-slate-400">Elapsed / ETA</div>
          <div className="mt-1 font-mono text-xl font-black text-slate-200">
            {elapsedSeconds}s
          </div>
          <div className="text-[10px] text-slate-400 font-mono mt-0.5">
            ETA: {etaSeconds}s
          </div>
        </div>

        <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
          <div className="text-[11px] font-bold uppercase text-slate-400">Quarantined</div>
          <div className="mt-1 font-mono text-xl font-black text-rose-400">
            {quarantinedRows.toLocaleString()}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">
            Non-fatal
          </div>
        </div>
      </div>
    </div>
  );
}
export default MetricsDashboard;
