import { Writable } from 'node:stream';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { CONFIG } from '../config.js';

let mongodbDriver = null;
try {
  mongodbDriver = await import('mongodb');
} catch (e) {
  // mongodb package not installed; fallback to embedded sqlite or ndjson sink
}

/**
 * Bulk Database Writer Stream.
 * Caches streaming records into memory batches (e.g. 1,000 docs) and executes
 * high-throughput bulk inserts (MongoDB bulkWrite or native SQLite transactions).
 * Provides backpressure to guarantee that Node.js V8 memory remains strictly bounded.
 */
export class BulkWriterStream extends Writable {
  /**
   * @param {Object} options
   * @param {number} [options.batchSize=1000] - Records per bulk insert
   * @param {string} [options.target='sqlite'] - 'mongodb' | 'sqlite' | 'ndjson'
   * @param {Object} [options.mongo] - { uri, dbName, collectionName }
   * @param {string} [options.outputPath] - File path for sqlite or ndjson
   * @param {Function} [options.onBatchCommitted] - Callback with metrics
   */
  constructor(options = {}) {
    super({ objectMode: true, highWaterMark: options.batchSize || CONFIG.DEFAULT_BATCH_SIZE });

    this.batchSize = options.batchSize || CONFIG.DEFAULT_BATCH_SIZE;
    this.target = options.target || 'sqlite';
    this.mongoConfig = options.mongo || null;
    this.outputPath = options.outputPath || null;
    this.onBatchCommitted = options.onBatchCommitted || (() => {});

    this.buffer = [];
    this.totalCommitted = 0;
    this.totalBatches = 0;
    this.isFlushing = false;

    // Database client instances
    this.mongoClient = null;
    this.mongoCollection = null;
    this.sqliteDb = null;
    this.ndjsonStream = null;
    this.sqliteTableInitialized = false;

    this._initDatabase();
  }

  _initDatabase() {
    if (this.target === 'mongodb' && this.mongoConfig) {
      if (!mongodbDriver) {
        console.warn('[BulkWriter] mongodb driver not found. Falling back to embedded SQLite bulk storage.');
        this.target = 'sqlite';
      } else {
        const { MongoClient } = mongodbDriver;
        const uri = this.mongoConfig.uri || CONFIG.DEFAULT_MONGODB_URI;
        const dbName = this.mongoConfig.dbName || CONFIG.DEFAULT_MONGODB_DATABASE;
        const collName = this.mongoConfig.collectionName || CONFIG.DEFAULT_MONGODB_COLLECTION;

        this.mongoClient = new MongoClient(uri, {
          maxPoolSize: 20,
          socketTimeoutMS: 30000
        });
        const db = this.mongoClient.db(dbName);
        this.mongoCollection = db.collection(collName);
        return;
      }
    }

    if (this.target === 'sqlite') {
      const dbFile = this.outputPath || path.join(CONFIG.OUTPUT_DIR, `streamweaver_${Date.now()}.sqlite`);
      fs.mkdirSync(path.dirname(dbFile), { recursive: true });
      this.sqliteDb = new DatabaseSync(dbFile);
      this.sqliteDb.exec('PRAGMA synchronous = OFF;');
      this.sqliteDb.exec('PRAGMA journal_mode = MEMORY;');
      return;
    }

    if (this.target === 'ndjson') {
      const jsonFile = this.outputPath || path.join(CONFIG.OUTPUT_DIR, `transformed_${Date.now()}.ndjson`);
      fs.mkdirSync(path.dirname(jsonFile), { recursive: true });
      this.ndjsonStream = fs.createWriteStream(jsonFile, { flags: 'a' });
    }
  }

  _write(record, encoding, callback) {
    this.buffer.push(record);

    if (this.buffer.length >= this.batchSize) {
      this._flushBatch(callback);
    } else {
      callback();
    }
  }

  _final(callback) {
    if (this.buffer.length > 0) {
      this._flushBatch(err => {
        this._cleanup();
        callback(err);
      });
    } else {
      this._cleanup();
      callback();
    }
  }

  /**
   * Flushes current buffer using bulk database write.
   * Backpressure: caller callback is delayed until database resolves.
   */
  async _flushBatch(callback) {
    if (this.buffer.length === 0) {
      return callback();
    }

    const batch = this.buffer;
    this.buffer = [];
    const count = batch.length;
    const startTime = performance.now();

    try {
      if (this.target === 'mongodb' && this.mongoCollection) {
        // High-throughput MongoDB bulkWrite with unordered inserts for maximum speed
        const operations = batch.map(doc => ({
          insertOne: {
            document: {
              ...doc,
              _insertedAt: new Date()
            }
          }
        }));

        await this.mongoCollection.bulkWrite(operations, {
          ordered: false,
          writeConcern: { w: 1, j: false }
        });
      } else if (this.target === 'sqlite' && this.sqliteDb) {
        this._writeSqliteBatch(batch);
      } else if (this.target === 'ndjson' && this.ndjsonStream) {
        const payload = batch.map(d => JSON.stringify(d)).join('\n') + '\n';
        if (!this.ndjsonStream.write(payload)) {
          await new Promise(resolve => this.ndjsonStream.once('drain', resolve));
        }
      }

      const durationMs = performance.now() - startTime;
      this.totalCommitted += count;
      this.totalBatches++;

      this.onBatchCommitted({
        batchNumber: this.totalBatches,
        batchCount: count,
        totalCommitted: this.totalCommitted,
        durationMs
      });

      callback();
    } catch (err) {
      console.error(`[BulkWriter] Batch flush error:`, err);
      // For MongoDB unordered bulk writes, some operations might fail validation while others succeed
      callback(err);
    }
  }

  _writeSqliteBatch(batch) {
    if (batch.length === 0) return;

    if (!this.sqliteTableInitialized) {
      const keys = Object.keys(batch[0]);
      const colDefs = keys.map(k => `"${k.replace(/"/g, '""')}" TEXT`).join(', ');
      this.sqliteDb.exec(`CREATE TABLE IF NOT EXISTS records (_sw_id INTEGER PRIMARY KEY AUTOINCREMENT, ${colDefs});`);
      this.sqliteTableInitialized = true;
    }

    const keys = Object.keys(batch[0]);
    const placeholders = `(${keys.map(() => '?').join(', ')})`;
    const sql = `INSERT INTO records (${keys.map(k => `"${k.replace(/"/g, '""')}"`).join(', ')}) VALUES ${placeholders}`;
    const stmt = this.sqliteDb.prepare(sql);

    this.sqliteDb.exec('BEGIN TRANSACTION;');
    for (let i = 0; i < batch.length; i++) {
      const row = batch[i];
      const params = keys.map(k => {
        const val = row[k];
        if (val === null || val === undefined) return '';
        if (typeof val === 'object') return JSON.stringify(val);
        return String(val);
      });
      stmt.run(...params);
    }
    this.sqliteDb.exec('COMMIT;');
  }

  _cleanup() {
    if (this.mongoClient) {
      this.mongoClient.close().catch(() => {});
    }
    if (this.sqliteDb) {
      try {
        this.sqliteDb.close();
      } catch {}
    }
    if (this.ndjsonStream) {
      this.ndjsonStream.end();
    }
  }
}
