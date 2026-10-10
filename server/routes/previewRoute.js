import fs from 'node:fs';
import path from 'node:path';
import { CONFIG } from '../config.js';
import { CsvParserStream } from '../engine/csvParserStream.js';
import { JsonParserStream } from '../engine/jsonParserStream.js';

export function registerPreviewRoutes(app) {
  /**
   * High-speed sample extractor.
   * Reads only the first N rows (default 100) using native streams and immediately
   * closes the file descriptor. Memory footprint remains < 1MB even for 10GB files.
   */
  app.get('/api/preview/:fileId', async (req, res) => {
    try {
      const fileId = path.basename(req.params.fileId);
      const filePath = path.join(CONFIG.UPLOAD_DIR, fileId);

      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: `File not found: ${fileId}` });
      }

      const stat = fs.statSync(filePath);
      const limit = parseInt(req.query.limit || '100', 10);
      const isJson = fileId.endsWith('.json') || fileId.endsWith('.ndjson');

      const rows = [];
      let headers = [];

      const readStream = fs.createReadStream(filePath, { highWaterMark: 64 * 1024 });
      const parserStream = isJson
        ? new JsonParserStream({ maxRows: limit })
        : new CsvParserStream({ maxRows: limit });

      let streamFinished = false;

      parserStream.on('data', row => {
        if (rows.length === 0) {
          headers = Object.keys(row);
        }
        rows.push(row);
        if (rows.length >= limit) {
          readStream.destroy();
          if (!streamFinished) {
            streamFinished = true;
            respond();
          }
        }
      });

      parserStream.on('end', () => {
        if (!streamFinished) {
          streamFinished = true;
          respond();
        }
      });

      readStream.on('error', err => {
        if (!streamFinished) {
          streamFinished = true;
          res.status(500).json({ error: err.message });
        }
      });

      parserStream.on('error', err => {
        if (!streamFinished) {
          streamFinished = true;
          res.status(500).json({ error: err.message });
        }
      });

      readStream.pipe(parserStream);

      function respond() {
        // Fast heuristic estimation for total rows based on sample row size
        let estimatedTotalRows = 0;
        if (rows.length > 0) {
          const sampleBytes = JSON.stringify(rows).length;
          const avgRowBytes = sampleBytes / rows.length;
          estimatedTotalRows = Math.round(stat.size / Math.max(avgRowBytes, 20));
        }

        res.json({
          success: true,
          fileId,
          sizeBytes: stat.size,
          sizeMb: Math.round((stat.size / 1024 / 1024) * 100) / 100,
          headers,
          previewRows: rows,
          rowCount: rows.length,
          estimatedTotalRows
        });
      }
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });
}
