import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { CONFIG } from '../config.js';
import { SyntheticDataGenerator } from '../engine/dataGenerator.js';

// Ensure directories exist
fs.mkdirSync(CONFIG.UPLOAD_DIR, { recursive: true });
fs.mkdirSync(CONFIG.TEMP_DIR, { recursive: true });

export function registerUploadRoutes(app) {
  /**
   * List uploaded datasets
   */
  app.get('/api/upload/files', (req, res) => {
    try {
      const files = fs.readdirSync(CONFIG.UPLOAD_DIR)
        .filter(f => !f.startsWith('.'))
        .map(name => {
          const fullPath = path.join(CONFIG.UPLOAD_DIR, name);
          const stat = fs.statSync(fullPath);
          return {
            id: name,
            name,
            sizeBytes: stat.size,
            sizeMb: Math.round((stat.size / 1024 / 1024) * 100) / 100,
            modifiedAt: stat.mtime
          };
        })
        .sort((a, b) => b.modifiedAt - a.modifiedAt);

      res.json({ success: true, files });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * Generate synthetic big data on the server
   * Avoids requiring the user to download and upload large GB files manually!
   */
  app.post('/api/upload/generate', async (req, res) => {
    try {
      const rows = parseInt(req.body.rows || 100000, 10);
      const format = req.body.format || 'csv';
      const fileId = `synthetic_${rows}_rows_${Date.now()}.${format}`;
      const targetPath = path.join(CONFIG.UPLOAD_DIR, fileId);

      const result = await SyntheticDataGenerator.generateToFile(targetPath, rows, format);

      res.json({
        success: true,
        fileId,
        fileName: fileId,
        rows,
        sizeBytes: result.sizeBytes,
        sizeMb: Math.round((result.sizeBytes / 1024 / 1024) * 100) / 100,
        durationMs: result.durationMs
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * Chunked upload handler for large files.
   * Chunks are written incrementally to disk to bypass Node heap limits.
   */
  app.post('/api/upload/chunk', (req, res) => {
    try {
      const { uploadId, chunkIndex, totalChunks, fileName } = req.headers;
      if (!uploadId || chunkIndex === undefined) {
        return res.status(400).json({ error: 'Missing uploadId or chunkIndex header' });
      }

      const tempFilePath = path.join(CONFIG.TEMP_DIR, `${uploadId}.part`);
      const writeStream = fs.createWriteStream(tempFilePath, { flags: chunkIndex === '0' ? 'w' : 'a' });

      req.pipe(writeStream);

      writeStream.on('finish', () => {
        const isLastChunk = parseInt(chunkIndex, 10) === parseInt(totalChunks, 10) - 1;

        if (isLastChunk) {
          const finalFileName = fileName || `upload_${uploadId}.csv`;
          const finalFilePath = path.join(CONFIG.UPLOAD_DIR, finalFileName);
          fs.renameSync(tempFilePath, finalFilePath);
          const stat = fs.statSync(finalFilePath);

          return res.json({
            success: true,
            complete: true,
            fileId: finalFileName,
            sizeBytes: stat.size
          });
        }

        res.json({ success: true, complete: false, chunkIndex: parseInt(chunkIndex, 10) });
      });

      writeStream.on('error', err => {
        res.status(500).json({ success: false, error: err.message });
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * Direct streaming upload
   */
  app.post('/api/upload/stream', (req, res) => {
    try {
      const rawName = req.query.name || `stream_${Date.now()}.csv`;
      const fileName = path.basename(rawName);
      const targetPath = path.join(CONFIG.UPLOAD_DIR, fileName);
      const writeStream = fs.createWriteStream(targetPath);

      req.pipe(writeStream);

      writeStream.on('finish', () => {
        const stat = fs.statSync(targetPath);
        res.json({
          success: true,
          fileId: fileName,
          sizeBytes: stat.size,
          sizeMb: Math.round((stat.size / 1024 / 1024) * 100) / 100
        });
      });

      writeStream.on('error', err => {
        res.status(500).json({ success: false, error: err.message });
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });
}
