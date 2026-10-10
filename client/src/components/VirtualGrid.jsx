import React, { useRef, useState, useMemo } from 'react';

/**
 * High-Throughput Virtualized Data Grid.
 * Prevents browser memory crashes and DOM bloat by calculating the exact
 * visible viewport slice (windowing) with overscan buffering.
 */
export function VirtualGrid({ headers = [], rows = [], rowHeight = 36, visibleCount = 14 }) {
  const containerRef = useRef(null);
  const [scrollTop, setScrollTop] = useState(0);

  const totalHeight = rows.length * rowHeight;
  const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - 3);
  const endIndex = Math.min(rows.length, startIndex + visibleCount + 6);
  const visibleRows = useMemo(() => rows.slice(startIndex, endIndex), [rows, startIndex, endIndex]);

  const handleScroll = (e) => {
    setScrollTop(e.target.scrollTop);
  };

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950 overflow-hidden shadow-inner">
      {/* Sticky Column Headers */}
      <div className="bg-slate-900 border-b border-slate-800 flex text-xs font-bold text-slate-300">
        <div className="w-14 px-3 py-2.5 text-center text-slate-400 font-mono border-r border-slate-800 shrink-0">
          #
        </div>
        {headers.map((col, idx) => (
          <div
            key={idx}
            className="flex-1 min-w-[160px] px-3 py-2.5 truncate font-mono uppercase tracking-wider text-slate-300 border-r border-slate-800/60 last:border-r-0"
          >
            {col}
          </div>
        ))}
      </div>

      {/* Virtual Viewport */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="overflow-y-auto overflow-x-auto relative"
        style={{ height: `${visibleCount * rowHeight}px` }}
      >
        <div style={{ height: `${totalHeight}px`, position: 'relative' }}>
          <div
            style={{
              transform: `translateY(${startIndex * rowHeight}px)`,
              position: 'absolute',
              left: 0,
              right: 0
            }}
          >
            {visibleRows.map((row, i) => {
              const rowIndex = startIndex + i;
              return (
                <div
                  key={rowIndex}
                  className={`flex text-xs border-b border-slate-800/40 hover:bg-slate-800/30 transition-colors ${
                    rowIndex % 2 === 0 ? 'bg-slate-950' : 'bg-slate-900/20'
                  }`}
                  style={{ height: `${rowHeight}px` }}
                >
                  <div className="w-14 px-3 py-2 text-center text-slate-400 font-mono border-r border-slate-800/40 shrink-0">
                    {rowIndex + 1}
                  </div>
                  {headers.map((col, colIdx) => (
                    <div
                      key={colIdx}
                      className="flex-1 min-w-[160px] px-3 py-2 truncate text-slate-300 font-mono border-r border-slate-800/30 last:border-r-0"
                      title={String(row[col] ?? '')}
                    >
                      {String(row[col] ?? '')}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
export default VirtualGrid;
