import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SyntheticDataGenerator } from '../server/engine/dataGenerator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Parse CLI flags
const args = process.argv.slice(2);
let rowCount = 100000;
let format = 'csv';

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--rows' && args[i + 1]) {
    rowCount = parseInt(args[i + 1], 10);
  }
  if (args[i] === '--format' && args[i + 1]) {
    format = args[i + 1];
  }
}

const uploadsDir = path.resolve(__dirname, '../uploads');
fs.mkdirSync(uploadsDir, { recursive: true });

const targetFile = path.join(uploadsDir, `benchmark_${rowCount}_rows.${format}`);

console.log(`=======================================================`);
console.log(`🔨 StreamWeaver Synthetic Big Data Generator`);
console.log(`📊 Target Rows: ${rowCount.toLocaleString()}`);
console.log(`📄 Format: ${format.toUpperCase()}`);
console.log(`📁 Destination: ${targetFile}`);
console.log(`=======================================================`);

const result = await SyntheticDataGenerator.generateToFile(targetFile, rowCount, format);

console.log(`✅ Generation Complete!`);
console.log(`📦 Size: ${(result.sizeBytes / 1024 / 1024).toFixed(2)} MB`);
console.log(`⏱️  Time: ${result.durationMs} ms`);
console.log(`⚡ Speed: ${Math.round(rowCount / (result.durationMs / 1000)).toLocaleString()} rows/sec`);
