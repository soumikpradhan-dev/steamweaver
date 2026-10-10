import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { CONFIG } from '../config.js';

let mongodbDriver = null;
try {
  mongodbDriver = await import('mongodb');
} catch (e) {}

export function registerDatabaseRoutes(app) {
  /**
   * Test MongoDB connection
   */
  app.post('/api/database/test-mongo', async (req, res) => {
    const { uri = CONFIG.DEFAULT_MONGODB_URI, dbName = CONFIG.DEFAULT_MONGODB_DATABASE } = req.body;

    if (!mongodbDriver) {
      return res.json({
        success: false,
        driverInstalled: false,
        message: 'MongoDB native driver not installed in this environment. StreamWeaver can run using the embedded high-throughput SQLite engine or install mongodb with `npm install mongodb`.'
      });
    }

    try {
      const { MongoClient } = mongodbDriver;
      const client = new MongoClient(uri, { serverSelectionTimeoutMS: 3000 });
      await client.connect();
      const db = client.db(dbName);
      const collections = await db.listCollections().toArray();
      await client.close();

      res.json({
        success: true,
        driverInstalled: true,
        message: 'Connected to MongoDB successfully!',
        collections: collections.map(c => c.name)
      });
    } catch (err) {
      res.json({
        success: false,
        driverInstalled: true,
        message: `Connection failed: ${err.message}`
      });
    }
  });

  /**
   * Inspect output records from SQLite destination
   */
  app.get('/api/database/sqlite-preview', (req, res) => {
    try {
      if (!fs.existsSync(CONFIG.OUTPUT_DIR)) {
        return res.json({ success: true, files: [] });
      }

      const files = fs.readdirSync(CONFIG.OUTPUT_DIR)
        .filter(f => f.endsWith('.sqlite'))
        .sort()
        .reverse();

      if (files.length === 0) {
        return res.json({ success: true, message: 'No SQLite exports found yet', records: [] });
      }

      const latestDbFile = path.join(CONFIG.OUTPUT_DIR, files[0]);
      const db = new DatabaseSync(latestDbFile);
      const countStmt = db.prepare('SELECT COUNT(*) as count FROM records;');
      const totalRow = countStmt.get();

      const previewStmt = db.prepare('SELECT * FROM records LIMIT 20;');
      const sample = previewStmt.all();
      db.close();

      res.json({
        success: true,
        file: files[0],
        totalRecords: totalRow ? totalRow.count : 0,
        sample
      });
    } catch (err) {
      res.json({ success: false, error: err.message });
    }
  });
}
