import EventEmitter from 'node:events';
import { CONFIG } from '../config.js';

export class MetricsTracker extends EventEmitter {
  /**
   * @param {Object} options
   * @param {number} [options.totalRows] - Estimated or total rows if known
   * @param {number} [options.intervalMs] - Telemetry broadcast interval
   */
  constructor(options = {}) {
    super();
    this.totalRows = options.totalRows || 0;
    this.intervalMs = options.intervalMs || CONFIG.METRICS_INTERVAL_MS;

    this.processedRows = 0;
    this.quarantinedRows = 0;
    this.committedRows = 0;
    this.totalBatches = 0;
    this.status = 'idle'; // 'idle' | 'running' | 'paused' | 'completed' | 'error'

    this.startTime = null;
    this.endTime = null;
    this.lastTimestamp = null;
    this.lastProcessedRows = 0;
    this.currentThroughput = 0; // rows / sec
    this.peakMemoryMb = 0;

    this.intervalHandle = null;
  }

  start() {
    this.status = 'running';
    this.startTime = Date.now();
    this.lastTimestamp = this.startTime;
    this.lastProcessedRows = 0;

    this.intervalHandle = setInterval(() => {
      this._tick();
    }, this.intervalMs);

    this._tick();
  }

  recordRowProcessed() {
    this.processedRows++;
  }

  recordQuarantined() {
    this.quarantinedRows++;
  }

  recordBatchCommitted(batchCount) {
    this.committedRows += batchCount;
    this.totalBatches++;
  }

  _tick() {
    const now = Date.now();
    const elapsedSec = (now - this.startTime) / 1000;
    const deltaSec = (now - this.lastTimestamp) / 1000;
    const deltaRows = this.processedRows - this.lastProcessedRows;

    if (deltaSec > 0) {
      // Smoothed moving average throughput
      const instantThroughput = Math.round(deltaRows / deltaSec);
      this.currentThroughput = Math.round(this.currentThroughput * 0.3 + instantThroughput * 0.7);
    }

    this.lastTimestamp = now;
    this.lastProcessedRows = this.processedRows;

    const mem = process.memoryUsage();
    const heapUsedMb = Math.round((mem.heapUsed / 1024 / 1024) * 10) / 10;
    const heapTotalMb = Math.round((mem.heapTotal / 1024 / 1024) * 10) / 10;
    const rssMb = Math.round((mem.rss / 1024 / 1024) * 10) / 10;

    if (rssMb > this.peakMemoryMb) {
      this.peakMemoryMb = rssMb;
    }

    // ETA calculation
    let etaSeconds = 0;
    let progressPct = 0;
    if (this.totalRows > 0) {
      progressPct = Math.min(100, Math.round((this.processedRows / this.totalRows) * 1000) / 10);
      const remainingRows = this.totalRows - this.processedRows;
      if (this.currentThroughput > 0) {
        etaSeconds = Math.max(0, Math.round(remainingRows / this.currentThroughput));
      }
    }

    const payload = {
      status: this.status,
      processedRows: this.processedRows,
      quarantinedRows: this.quarantinedRows,
      committedRows: this.committedRows,
      totalBatches: this.totalBatches,
      totalRows: this.totalRows,
      progressPct,
      throughput: this.currentThroughput,
      elapsedSeconds: Math.round(elapsedSec * 10) / 10,
      etaSeconds,
      memory: {
        heapUsedMb,
        heapTotalMb,
        rssMb,
        peakMemoryMb: this.peakMemoryMb
      },
      timestamp: now
    };

    this.emit('metrics', payload);
  }

  finish(status = 'completed') {
    this.status = status;
    this.endTime = Date.now();
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
    this._tick();
    this.emit('finished', {
      status: this.status,
      totalProcessed: this.processedRows,
      totalQuarantined: this.quarantinedRows,
      totalCommitted: this.committedRows,
      durationSeconds: Math.round(((this.endTime - this.startTime) / 1000) * 10) / 10,
      averageThroughput: Math.round(this.processedRows / (((this.endTime - this.startTime) / 1000) || 1)),
      peakMemoryMb: this.peakMemoryMb
    });
  }
}
