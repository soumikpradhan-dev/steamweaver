import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const CONFIG = {
  PORT: process.env.PORT || 3000,
  HOST: process.env.HOST || '0.0.0.0',
  UPLOAD_DIR: path.resolve(__dirname, '../uploads'),
  OUTPUT_DIR: path.resolve(__dirname, '../output'),
  TEMP_DIR: path.resolve(__dirname, '../temp'),
  DEFAULT_BATCH_SIZE: 1000,
  SANDBOX_TIMEOUT_MS: 50, // 50ms per record execution ceiling
  MAX_SANDBOX_MEMORY_MB: 16,
  METRICS_INTERVAL_MS: 200, // broadcast telemetry every 200ms
  DEFAULT_MONGODB_URI: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017',
  DEFAULT_MONGODB_DATABASE: 'streamweaver',
  DEFAULT_MONGODB_COLLECTION: 'transformed_records'
};
