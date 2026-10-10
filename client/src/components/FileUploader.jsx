import React, { useState } from 'react';

/**
 * Chunked File Uploader & Synthetic Dataset Generator.
 * Avoids loading multi-gigabyte files into client RAM by streaming chunked binary slices.
 */
export function FileUploader({ files = [], selectedFile, onSelectFile, onDatasetGenerated }) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);

  const handleGenerate = async (rows) => {
    setIsGenerating(true);
    try {
      const res = await fetch('/api/upload/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows, format: 'csv' })
      });
      const data = await res.json();
      if (data.success) {
        onDatasetGenerated(data.fileId);
      }
    } catch (err) {
      alert(`Generation failed: ${err.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsUploading(true);
    setUploadProgress(0);

    const chunkSize = 2 * 1024 * 1024; // 2MB chunks
    const totalChunks = Math.ceil(file.size / chunkSize);
    const uploadId = `upload_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    try {
      for (let i = 0; i < totalChunks; i++) {
        const start = i * chunkSize;
        const end = Math.min(file.size, start + chunkSize);
        const chunk = file.slice(start, end);

        const res = await fetch('/api/upload/chunk', {
          method: 'POST',
          headers: {
            'uploadId': uploadId,
            'chunkIndex': String(i),
            'totalChunks': String(totalChunks),
            'fileName': file.name
          },
          body: chunk
        });

        const data = await res.json();
        setUploadProgress(Math.round(((i + 1) / totalChunks) * 100));

        if (data.complete) {
          onDatasetGenerated(data.fileId);
        }
      }
    } catch (err) {
      alert(`Chunked upload failed: ${err.message}`);
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400">
            Source Dataset Selection & Streaming Uploader
          </h2>
          <p className="text-xs text-slate-400">
            Streams multi-gigabyte datasets piece-by-piece to Node.js without RAM exhaustion.
          </p>
        </div>

        {/* Big data synthetic generator actions */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-400 font-medium">Quick Generate:</span>
          <button
            onClick={() => handleGenerate(10000)}
            disabled={isGenerating}
            className="px-2.5 py-1 text-xs rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 transition"
          >
            10K Rows
          </button>
          <button
            onClick={() => handleGenerate(100000)}
            disabled={isGenerating}
            className="px-2.5 py-1 text-xs rounded-lg bg-indigo-900/60 hover:bg-indigo-800 border border-indigo-700 text-indigo-200 transition"
          >
            100K Rows (~15MB)
          </button>
          <button
            onClick={() => handleGenerate(1000000)}
            disabled={isGenerating}
            className="px-2.5 py-1 text-xs rounded-lg bg-indigo-600 hover:bg-indigo-500 font-semibold text-white shadow-md shadow-indigo-600/30 transition"
          >
            ⚡ 1M Rows (~150MB)
          </button>
        </div>
      </div>

      {/* Chunked Upload Dropzone */}
      <div className="flex items-center gap-3">
        <label className="cursor-pointer px-4 py-2 rounded-xl bg-slate-950 border border-slate-800 hover:border-slate-700 text-xs text-slate-300 font-semibold flex items-center space-x-2 transition">
          <span>📁 Browse & Stream Upload (CSV / JSON)</span>
          <input
            type="file"
            accept=".csv,.json,.ndjson"
            onChange={handleFileUpload}
            className="hidden"
          />
        </label>

        {isUploading && (
          <div className="flex-1 flex items-center gap-2 text-xs text-indigo-400 font-mono">
            <span>Streaming chunk: {uploadProgress}%</span>
            <div className="flex-1 h-2 rounded-full bg-slate-950 border border-slate-800 overflow-hidden">
              <div
                className="h-full bg-indigo-500 transition-all duration-150"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Dataset Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
        {files.map(file => (
          <div
            key={file.id}
            onClick={() => onSelectFile(file.id)}
            className={`cursor-pointer rounded-xl p-3 border transition flex flex-col justify-between ${
              selectedFile === file.id
                ? 'bg-indigo-950/40 border-indigo-500 ring-2 ring-indigo-500/20'
                : 'bg-slate-950 border-slate-800 hover:border-slate-700'
            }`}
          >
            <div className="truncate font-semibold text-xs text-slate-200" title={file.name}>
              {file.name}
            </div>
            <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400 font-mono">
              <span>{file.sizeMb} MB</span>
              <span>{new Date(file.modifiedAt).toLocaleTimeString()}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
export default FileUploader;
