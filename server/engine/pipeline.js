import fs from 'node:fs';
import { Transform, pipeline } from 'node:stream';
import { promisify } from 'node:util';
import EventEmitter from 'node:events';
import { CsvParserStream } from './csvParserStream.js';
import { JsonParserStream } from './jsonParserStream.js';
import { SecureSandbox } from './sandbox.js';
import { BulkWriterStream } from './bulkWriter.js';
import { MetricsTracker } from './metricsTracker.js';

const pipelineAsync = promisify(pipeline);

/**
 * High-Throughput Stream Pipeline Coordinator.
 * Seamlessly chains native streams:
 * fs.createReadStream -> CsvParser -> SandboxTransform -> BulkWriter
 */
export class StreamPipeline extends EventEmitter {
  /**
   * @param {Object} options
   * @param {string} options.filePath - Input dataset file path
   * @param {string} [options.fileType='csv'] - 'csv' | 'json' | 'ndjson'
   * @param {number} [options.totalRows=0] - Total estimated rows
   * @param {Array<{source: string, target: string, type?: string}>} [options.mapping=[]] - Column mappings
   * @param {string} [options.transformCode] - JavaScript sandbox transformation script
   * @param {number} [options.batchSize=1000] - Database bulk batch size
   * @param {string} [options.destination='sqlite'] - 'mongodb' | 'sqlite' | 'ndjson'
   * @param {Object} [options.mongo] - MongoDB credentials { uri, dbName, collectionName }
   * @param {string} [options.outputPath] - Output file path if writing sqlite/ndjson
   */
  constructor(options) {
    super();
    this.options = options;
    this.id = options.id || `pipeline_${Date.now()}`;
    this.filePath = options.filePath;
    this.fileType = options.fileType || 'csv';
    this.mapping = options.mapping || [];
    this.transformCode = options.transformCode || 'return row;';
    this.batchSize = options.batchSize || 1000;
    this.destination = options.destination || 'sqlite';
    this.mongo = options.mongo || null;
    this.outputPath = options.outputPath || null;

    this.metrics = new MetricsTracker({
      totalRows: options.totalRows || 0
    });

    this.quarantinedRows = [];
    this.maxQuarantineStorage = 500; // retain sample of errors for UI inspection
    this.abortController = new AbortController();
    this.sandbox = null;
    this.isRunning = false;

    // Relay metrics events to pipeline listeners
    this.metrics.on('metrics', data => this.emit('metrics', data));
    this.metrics.on('finished', data => this.emit('finished', data));
  }

  /**
   * Type caster helper
   */
  _castValue(val, type) {
    if (val === undefined || val === null || val === '') return null;
    switch (type) {
      case 'number':
      case 'float': {
        const n = parseFloat(val);
        return isNaN(n) ? null : n;
      }
      case 'integer': {
        const n = parseInt(val, 10);
        return isNaN(n) ? null : n;
      }
      case 'boolean': {
        const s = String(val).toLowerCase().trim();
        return s === 'true' || s === '1' || s === 'yes';
      }
      case 'date': {
        const d = new Date(val);
        return isNaN(d.getTime()) ? null : d.toISOString();
      }
      case 'string':
      default:
        return String(val);
    }
  }

  /**
   * Execute the streaming ETL pipeline.
   */
  async run() {
    this.isRunning = true;
    this.metrics.start();
    this.emit('start', { id: this.id, startedAt: Date.now() });

    try {
      // 1. Initialize Sandbox
      this.sandbox = new SecureSandbox({
        transformCode: this.transformCode
      });

      // 2. Setup Source Stream
      const readStream = fs.createReadStream(this.filePath, {
        highWaterMark: 64 * 1024, // 64KB read chunks for optimal I/O throughput
        signal: this.abortController.signal
      });

      // 3. Setup Parser Stream
      const parserStream = this.fileType === 'csv'
        ? new CsvParserStream()
        : new JsonParserStream();

      // 4. Setup Transformation Stream (Mapping + Sandbox)
      const mapping = this.mapping;
      const sandbox = this.sandbox;
      const metrics = this.metrics;
      const self = this;

      const transformStream = new Transform({
        objectMode: true,
        highWaterMark: 2048,
        transform(rawRow, encoding, callback) {
          try {
            // Apply visual column mapping & typing
            let mappedRow = {};
            if (mapping && mapping.length > 0) {
              for (let i = 0; i < mapping.length; i++) {
                const map = mapping[i];
                if (!map.target) continue;
                const sourceVal = rawRow[map.source];
                mappedRow[map.target] = map.type
                  ? self._castValue(sourceVal, map.type)
                  : sourceVal;
              }
            } else {
              mappedRow = { ...rawRow };
            }

            // Execute custom JavaScript transformation inside isolated V8 sandbox
            const transformedRow = sandbox.execute(mappedRow);

            metrics.recordRowProcessed();
            callback(null, transformedRow);
          } catch (err) {
            // Quarantine failed rows instead of crashing the pipeline
            metrics.recordQuarantined();

            if (self.quarantinedRows.length < self.maxQuarantineStorage) {
              const quarantineRecord = {
                timestamp: new Date().toISOString(),
                error: err.message,
                rawRow
              };
              self.quarantinedRows.push(quarantineRecord);
              self.emit('quarantine', quarantineRecord);
            }

            // Discard bad row and continue stream
            callback();
          }
        }
      });

      // 5. Setup Bulk Writer Stream
      const bulkWriter = new BulkWriterStream({
        batchSize: this.batchSize,
        target: this.destination,
        mongo: this.mongo,
        outputPath: this.outputPath,
        onBatchCommitted: info => {
          metrics.recordBatchCommitted(info.batchCount);
        }
      });

      // 6. Pipe through native streaming pipeline
      await pipelineAsync(
        readStream,
        parserStream,
        transformStream,
        bulkWriter,
        { signal: this.abortController.signal }
      );

      this.metrics.finish('completed');
      this.emit('done', {
        id: this.id,
        metrics: this.metrics
      });
    } catch (err) {
      if (err.name === 'AbortError') {
        this.metrics.finish('aborted');
        this.emit('aborted', { id: this.id });
      } else {
        console.error(`[StreamPipeline ${this.id}] Fatal Error:`, err);
        this.metrics.finish('error');
        this.emit('error', err);
        throw err;
      }
    } finally {
      this.isRunning = false;
      if (this.sandbox) {
        this.sandbox.dispose();
      }
    }
  }

  /**
   * Abort active pipeline
   */
  abort() {
    if (this.isRunning) {
      this.abortController.abort();
    }
  }

  /**
   * Return recent quarantined rows
   */
  getQuarantined() {
    return this.quarantinedRows;
  }
}
