import React, { useState } from 'react';

/**
 * Sandbox Transformation Editor.
 * Allows authoring custom JavaScript transformations safely isolated by isolated-vm / V8.
 */
export function SandboxEditor({ code, onChange, onTest, isTesting, testResult }) {
  const recipes = [
    {
      name: 'Capitalize Name',
      code: `// Capitalize customer name\nif (row.customer_name) {\n  row.customer_name = row.customer_name.toUpperCase().trim();\n}\nreturn row;`
    },
    {
      name: 'Normalize Email',
      code: `// Sanitize email address\nif (row.email) {\n  row.email = row.email.toLowerCase().replace(/\\s+/g, '');\n}\nreturn row;`
    },
    {
      name: 'Tax Calculation',
      code: `// Compute 8.25% state sales tax\nconst amount = Number(row.amount || 0);\nrow.tax = Math.round(amount * 0.0825 * 100) / 100;\nrow.total = Math.round((amount + row.tax) * 100) / 100;\nreturn row;`
    },
    {
      name: 'Clean Phone',
      code: `// Strip non-numeric phone symbols\nif (row.phone) {\n  row.phone = String(row.phone).replace(/\\D/g, '');\n}\nreturn row;`
    },
    {
      name: 'Mask PII',
      code: `// Mask sensitive email prefix\nif (row.email) {\n  const [u, d] = row.email.split('@');\n  row.email = u.slice(0, 2) + '***@' + (d || 'privacy.net');\n}\nreturn row;`
    }
  ];

  return (
    <div className="space-y-3">
      {/* Recipe Bar */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] text-slate-400 font-medium">Quick Recipes:</span>
        {recipes.map((r, i) => (
          <button
            key={i}
            onClick={() => onChange(r.code)}
            className="px-2 py-0.5 text-[11px] rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 transition"
          >
            {r.name}
          </button>
        ))}
      </div>

      {/* Editor Box */}
      <div className="rounded-xl border border-slate-800 bg-slate-950 overflow-hidden shadow-sm">
        <div className="px-3 py-1.5 bg-slate-900 border-b border-slate-800 flex items-center justify-between text-xs text-slate-400 font-mono">
          <span>function transform(row, helpers) &#123;</span>
          <span className="text-[10px] text-emerald-400 font-sans font-semibold">
            isolated-vm Sandbox
          </span>
        </div>

        <textarea
          value={code}
          onChange={(e) => onChange(e.target.value)}
          rows={7}
          className="w-full bg-slate-950 p-3 text-xs font-mono text-emerald-300 focus:outline-none resize-none"
          spellCheck="false"
        />

        <div className="px-3 py-1 bg-slate-900 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400 font-mono">
          <span>&#125;</span>
          <button
            onClick={onTest}
            disabled={isTesting}
            className="px-2.5 py-0.5 rounded text-[11px] font-sans font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition flex items-center space-x-1"
          >
            <span>▶</span>
            <span>{isTesting ? 'Evaluating...' : 'Test Row 1'}</span>
          </button>
        </div>
      </div>

      {/* Evaluation Result */}
      {testResult && (
        <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono">
          <div className="flex items-center justify-between mb-1">
            <span className={testResult.success ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
              {testResult.success ? '✓ Sandbox Execution Succeeded' : '✗ Execution Failed'}
            </span>
            {testResult.executionTimeMs !== undefined && (
              <span className="text-[10px] text-slate-400 font-sans">
                {testResult.executionTimeMs} ms | {testResult.engine}
              </span>
            )}
          </div>
          <pre className="text-[11px] text-indigo-300 overflow-x-auto max-h-24">
            {JSON.stringify(testResult.output || testResult.error, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
export default SandboxEditor;
