import path from 'node:path';
import fs from 'node:fs';
import { CONFIG } from '../config.js';
import { StreamPipeline } from '../engine/pipeline.js';
import { SecureSandbox } from '../engine/sandbox.js';

// Active pipeline registry
const activePipelines = new Map();

export function registerPipelineRoutes(app) {
  /**
   * Test JavaScript transformation in sandbox on a sample row
   */
  app.post('/api/pipeline/test-transform', (req, res) => {
    try {
      const { row, code } = req.body;
      if (!row || typeof row !== 'object') {
        return res.status(400).json({ error: 'Missing row object' });
      }

      const sandbox = new SecureSandbox({
        transformCode: code || 'return row;'
      });

      const startTime = performance.now();
      const output = sandbox.execute(row);
      const executionTimeMs = Math.round((performance.now() - startTime) * 1000) / 1000;
      sandbox.dispose();

      res.json({
        success: true,
        output,
        executionTimeMs,
        engine: sandbox.engineType
      });
    } catch (err) {
      res.status(400).json({
        success: false,
        error: err.message
      });
    }
  });

  /**
   * Start a streaming ETL pipeline
   */
  app.post('/api/pipeline/start', (req, res) => {
    try {
      const {
        fileId,
        mapping = [],
        transformCode = 'return row;',
        batchSize = CONFIG.DEFAULT_BATCH_SIZE,
        destination = 'sqlite',
        mongo = null,
        estimatedTotalRows = 0
      } = req.body;

      if (!fileId) {
        return res.status(400).json({ error: 'fileId is required' });
      }

      const filePath = path.join(CONFIG.UPLOAD_DIR, path.basename(fileId));
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: `File not found: ${fileId}` });
      }

      const isJson = fileId.endsWith('.json') || fileId.endsWith('.ndjson');
      const pipelineId = `pipe_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

      const pipeline = new StreamPipeline({
        id: pipelineId,
        filePath,
        fileType: isJson ? 'json' : 'csv',
        totalRows: estimatedTotalRows,
        mapping,
        transformCode,
        batchSize: parseInt(batchSize, 10),
        destination,
        mongo
      });

      activePipelines.set(pipelineId, pipeline);

      // Launch pipeline asynchronously
      pipeline.run().catch(err => {
        console.error(`Pipeline ${pipelineId} error:`, err);
      });

      res.json({
        success: true,
        pipelineId,
        status: 'running',
        batchSize,
        destination
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * Server-Sent Events (SSE) telemetry stream
   */
  app.get('/api/pipeline/stream/:pipelineId', (req, res) => {
    const pipelineId = req.params.pipelineId;
    const pipeline = activePipelines.get(pipelineId);

    if (!pipeline) {
      return res.status(404).json({ error: 'Pipeline not found' });
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive'
    });

    res.write(`data: ${JSON.stringify({ type: 'connected', pipelineId })}\n\n`);

    const metricsListener = data => {
      res.write(`data: ${JSON.stringify({ type: 'metrics', data })}\n\n`);
    };

    const quarantineListener = data => {
      res.write(`data: ${JSON.stringify({ type: 'quarantine', data })}\n\n`);
    };

    const doneListener = result => {
      res.write(`data: ${JSON.stringify({ type: 'done', result })}\n\n`);
      res.end();
    };

    const errorListener = err => {
      res.write(`data: ${JSON.stringify({ type: 'error', error: err.message })}\n\n`);
      res.end();
    };

    pipeline.on('metrics', metricsListener);
    pipeline.on('quarantine', quarantineListener);
    pipeline.on('done', doneListener);
    pipeline.on('error', errorListener);

    req.on('close', () => {
      pipeline.off('metrics', metricsListener);
      pipeline.off('quarantine', quarantineListener);
      pipeline.off('done', doneListener);
      pipeline.off('error', errorListener);
    });
  });

  /**
   * Abort pipeline execution
   */
  app.post('/api/pipeline/abort/:pipelineId', (req, res) => {
    const pipelineId = req.params.pipelineId;
    const pipeline = activePipelines.get(pipelineId);

    if (!pipeline) {
      return res.status(404).json({ error: 'Pipeline not found' });
    }

    pipeline.abort();
    res.json({ success: true, message: 'Pipeline abort requested' });
  });

  /**
   * Fetch quarantined rows
   */
  app.get('/api/pipeline/quarantine/:pipelineId', (req, res) => {
    const pipelineId = req.params.pipelineId;
    const pipeline = activePipelines.get(pipelineId);

    if (!pipeline) {
      return res.status(404).json({ error: 'Pipeline not found' });
    }

    res.json({
      success: true,
      quarantined: pipeline.getQuarantined()
    });
  });
}
