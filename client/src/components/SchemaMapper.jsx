import React from 'react';

/**
 * Visual Schema Mapping Component.
 * Enables non-technical users to map arbitrary raw dataset columns
 * to standardized destination attributes with automatic type casting.
 */
export function SchemaMapper({ mappings = [], onMappingChange }) {
  const handleToggleInclude = (index, checked) => {
    const updated = [...mappings];
    updated[index].include = checked;
    onMappingChange(updated);
  };

  const handleTargetChange = (index, value) => {
    const updated = [...mappings];
    updated[index].target = value;
    onMappingChange(updated);
  };

  const handleTypeChange = (index, value) => {
    const updated = [...mappings];
    updated[index].type = value;
    onMappingChange(updated);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-slate-400 font-semibold uppercase tracking-wider">
        <span>Source Field</span>
        <span>Destination Attribute & Type</span>
      </div>

      <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
        {mappings.map((map, idx) => (
          <div
            key={idx}
            className={`p-2.5 rounded-xl border transition-all flex items-center gap-2 ${
              map.include
                ? 'bg-slate-950 border-slate-800'
                : 'bg-slate-950/40 border-slate-900 opacity-50'
            }`}
          >
            <input
              type="checkbox"
              checked={map.include}
              onChange={(e) => handleToggleInclude(idx, e.target.checked)}
              className="rounded border-slate-700 text-indigo-600 focus:ring-0 cursor-pointer"
            />

            <div className="w-1/3 truncate text-xs font-mono text-slate-200" title={map.source}>
              {map.source}
            </div>

            <span className="text-slate-600 text-xs">➔</span>

            <input
              type="text"
              value={map.target}
              onChange={(e) => handleTargetChange(idx, e.target.value)}
              placeholder="target_field"
              className="w-1/3 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-indigo-300 font-mono focus:border-indigo-500 focus:outline-none"
            />

            <select
              value={map.type}
              onChange={(e) => handleTypeChange(idx, e.target.value)}
              className="w-1/4 bg-slate-900 border border-slate-700 rounded px-1.5 py-1 text-xs text-slate-300 focus:outline-none"
            >
              <option value="string">String</option>
              <option value="number">Number</option>
              <option value="integer">Integer</option>
              <option value="float">Float</option>
              <option value="boolean">Boolean</option>
              <option value="date">Date (ISO)</option>
            </select>
          </div>
        ))}
      </div>
    </div>
  );
}
export default SchemaMapper;
