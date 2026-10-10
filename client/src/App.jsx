import React, { useState, useEffect } from 'react';
import Header from './components/Header.jsx';
import FileUploader from './components/FileUploader.jsx';
import VirtualGrid from './components/VirtualGrid.jsx';
import SchemaMapper from './components/SchemaMapper.jsx';
import SandboxEditor from './components/SandboxEditor.jsx';
import MetricsDashboard from './components/MetricsDashboard.jsx';

export function App() {
  const [files, setFiles] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewData, setPreviewData] = useState(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  const [mappings, setMappings] = useState([]);
  const [transformCode, setTransformCode] = useState(
`// User-defined transformation in isolated V8 sandbox
// Input: 'row' (read-only copy), helpers
if (row.customer_name) {
  row.customer_name = row.customer_name.toUpperCase().trim();
}
if (row.email) {
  row.email = row.email.toLowerCase().trim();
}
if (row.amount) {
  row.amount = Math.round(Number(row.amount) * 1.0825 * 100) / 100; // Apply 8.25% tax
}
return row;`
  );
  const [batchSize, setBatchSize] = useState(1000);
  const [destination, setDestination] = useState('sqlite');
  const [mongoConfig, setMongoConfig] = useState({
    uri: 'mongodb://127.0.0.1:27017',
    dbName: 'streamweaver',
    collectionName: 'transformed_records'
  });

  const [pipelineId, setPipelineId] = useState(null);
  const [pipelineStatus, setPipelineStatus] = useState('idle');
  const [metrics, setMetrics] = useState({
    processedRows: 0,
    quarantinedRows: 0,
    committedRows: 0,
    totalBatches: 0,
    progressPct: 0,
    throughput: 0,
    elapsedSeconds: 0,
    etaSeconds: 0,
    memory: { heapUsedMb: 0, heapTotalMb: 0, rssMb: 0, peakMemoryMb: 0 }
  });
  const [testResult, setTestResult] = useState(null);
  const [isTestingTransform, setIsTestingTransform] = useState(false);

  const loadFiles = async () => {
    try {
      const res = await fetch('/api/upload/files');
      const data = await res.json();
      if (data.success) {
        setFiles(data.files);
        if (data.files.length > 0 && !selectedFile) {
          selectFile(data.files[0].id);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadFiles();
  }, []);

  const selectFile = async (fileId) => {
    setSelectedFile(fileId);
    setIsLoadingPreview(true);
    try {
      const res = await fetch(`/api/preview/${encodeURIComponent(fileId)}?limit=100`);
      const data = await res.json();
      if (data.success) {
        setPreviewData(data);
        const initialMappings = data.headers.map(h => ({
          source: h,
          target: h.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase(),
          type: 'string',
          include: true
        }));
        setMappings(initialMappings);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handleTestTransform = async () => {
    if (!previewData || previewData.previewRows.length === 0) return;
    setIsTestingTransform(true);
    try {
      const sample = { ...previewData.previewRows[0] };
      const mappedSample = {};
      mappings.filter(m => m.include).forEach(m => {
        mappedSample[m.target] = sample[m.source];
      });

      const res = await fetch('/api/pipeline/test-transform', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ row: mappedSample, code: transformCode })
      });
      const data = await res.json();
      setTestResult(data);
    } catch (err) {
      setTestResult({ success: false, error: err.message });
    } finally {
      setIsTestingTransform(false);
    }
  };

  const handleStartPipeline = async () => {
    if (!selectedFile) return;

    try {
      setPipelineStatus('running');
      const payload = {
        fileId: selectedFile,
        mapping: mappings.filter(m => m.include),
        transformCode,
        batchSize: Number(batchSize),
        destination,
        mongo: destination === 'mongodb' ? mongoConfig : null,
        estimatedTotalRows: previewData?.estimatedTotalRows || 0
      };

      const res = await fetch('/api/pipeline/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (!data.success) throw new Error(data.error);

      setPipelineId(data.pipelineId);

      const eventSource = new EventSource(`/api/pipeline/stream/${data.pipelineId}`);
      eventSource.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg.type === 'metrics') setMetrics(msg.data);
        else if (msg.type === 'done') {
          setPipelineStatus('completed');
          eventSource.close();
        } else if (msg.type === 'error') {
          setPipelineStatus('error');
          eventSource.close();
        }
      };
      eventSource.onerror = () => eventSource.close();
    } catch (err) {
      setPipelineStatus('error');
      alert('Pipeline launch error: ' + err.message);
    }
  };

  const handleAbort = async () => {
    if (!pipelineId) return;
    await fetch(`/api/pipeline/abort/${pipelineId}`, { method: 'POST' });
    setPipelineStatus('aborted');
  };

  return (
    <div className="flex flex-col min-h-screen bg-slate-950 text-slate-100 font-sans">
      <Header pipelineStatus={pipelineStatus} onAbort={handleAbort} />

      <main className="max-w-7xl mx-auto px-4 py-6 w-full flex-1 space-y-6">
        <FileUploader
          files={files}
          selectedFile={selectedFile}
          onSelectFile={selectFile}
          onDatasetGenerated={(id) => {
            loadFiles();
            selectFile(id);
          }}
        />

        {/* Virtualized Grid */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400">
              Dataset Preview Grid (Virtualization)
            </h2>
            <span className="text-xs text-indigo-400 font-mono">
              Estimated Total: {previewData?.estimatedTotalRows?.toLocaleString() || 0} rows
            </span>
          </div>

          {previewData && previewData.previewRows.length > 0 ? (
            <VirtualGrid
              headers={previewData.headers}
              rows={previewData.previewRows}
            />
          ) : (
            <div className="h-32 flex items-center justify-center text-slate-500 text-sm">
              Select or generate a dataset to load preview
            </div>
          )}
        </div>

        {/* Mapping & Sandbox Editor */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-3">
              Schema Mapping
            </h2>
            <SchemaMapper mappings={mappings} onMappingChange={setMappings} />
          </div>

          <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col justify-between">
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-2">
                isolated-vm Transformation Sandbox
              </h2>
              <SandboxEditor
                code={transformCode}
                onChange={setTransformCode}
                onTest={handleTestTransform}
                isTesting={isTestingTransform}
                testResult={testResult}
              />
            </div>

            <div className="mt-4 pt-4 border-t border-slate-800 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="text-xs text-slate-400 font-medium">bulkWrite Batch:</span>
                <select
                  value={batchSize}
                  onChange={(e) => setBatchSize(Number(e.target.value))}
                  className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200"
                >
                  <option value="500">500 docs</option>
                  <option value="1000">1,000 docs (Standard)</option>
                  <option value="2500">2,500 docs</option>
                  <option value="5000">5,000 docs</option>
                </select>
              </div>

              <button
                onClick={handleStartPipeline}
                disabled={pipelineStatus === 'running'}
                className="px-6 py-2 rounded-xl text-sm font-bold bg-indigo-600 hover:bg-indigo-500 text-white transition shadow-lg shadow-indigo-600/30"
              >
                Launch Pipeline
              </button>
            </div>
          </div>
        </div>

        {/* Telemetry */}
        <MetricsDashboard
          metrics={metrics}
          status={pipelineStatus}
          onAbort={handleAbort}
        />
      </main>
    </div>
  );
}
export default App;
