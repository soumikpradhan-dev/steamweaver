import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { CsvParserStream } from '../server/engine/csvParserStream.js';
import { StreamPipeline } from '../server/engine/pipeline.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('--- Testing StreamPipeline Engine ---');

// Test 1: CSV parser stream tokenizer with quoted cells & commas
{
  console.log('Test 1: CSV Parser stream tokenization');
  const parser = new CsvParserStream();
  const testCsv = 'id,name,address,notes\n1,"Doe, John","123 Main St, Apt 4B","Said ""Hello"""\n2,"Jane Smith","456 Oak Rd","Normal"\n';

  const rows = [];
  parser.on('data', row => rows.push(row));

  await new Promise(resolve => {
    parser.on('end', resolve);
    parser.write(testCsv);
    parser.end();
  });

  assert.strictEqual(rows.length, 2);
  assert.strictEqual(rows[0].id, '1');
  assert.strictEqual(rows[0].name, 'Doe, John');
  assert.strictEqual(rows[0].address, '123 Main St, Apt 4B');
  assert.strictEqual(rows[0].notes, 'Said "Hello"');
  assert.strictEqual(rows[1].name, 'Jane Smith');
  console.log('✓ Test 1 Passed: Quoted commas and escaped quotes parsed accurately');
}

// Test 2: End-to-end streaming pipeline with mapping, sandbox, and bulk write
{
  console.log('Test 2: End-to-end Pipeline with mapping & bulk writer');
  const tempCsv = path.join(__dirname, 'temp_test_input.csv');
  const tempDb = path.join(__dirname, 'temp_test_output.sqlite');
  if (fs.existsSync(tempCsv)) fs.unlinkSync(tempCsv);
  if (fs.existsSync(tempDb)) fs.unlinkSync(tempDb);

  // Generate 2,500 test rows to verify multi-batch flushes (batch size = 1,000)
  let csvContent = 'customer_id,raw_name,spend_amount\n';
  for (let i = 1; i <= 2500; i++) {
    csvContent += `CUST-${i},"customer_${i}",${(i * 1.5).toFixed(2)}\n`;
  }
  fs.writeFileSync(tempCsv, csvContent, 'utf8');

  const pipeline = new StreamPipeline({
    filePath: tempCsv,
    fileType: 'csv',
    totalRows: 2500,
    batchSize: 1000,
    destination: 'sqlite',
    outputPath: tempDb,
    mapping: [
      { source: 'customer_id', target: 'id', type: 'string' },
      { source: 'raw_name', target: 'name', type: 'string' },
      { source: 'spend_amount', target: 'amount', type: 'float' }
    ],
    transformCode: `
      row.name = row.name.toUpperCase();
      row.loyalty_tier = row.amount > 1000 ? 'GOLD' : 'STANDARD';
      return row;
    `
  });

  await pipeline.run();

  assert.strictEqual(pipeline.metrics.processedRows, 2500);
  assert.strictEqual(pipeline.metrics.totalBatches, 3); // 1000 + 1000 + 500

  // Inspect database output
  const db = new DatabaseSync(tempDb);
  const rowCount = db.prepare('SELECT COUNT(*) as count FROM records;').get().count;
  assert.strictEqual(rowCount, 2500);

  const sampleRow = db.prepare("SELECT * FROM records WHERE id = 'CUST-1';").get();
  assert.strictEqual(sampleRow.name, 'CUSTOMER_1');
  db.close();

  // Cleanup
  fs.unlinkSync(tempCsv);
  fs.unlinkSync(tempDb);
  console.log('✓ Test 2 Passed: 2,500 records processed across 3 bulk batches');
}

console.log('=======================================');
console.log('🎉 ALL PIPELINE TESTS PASSED!');
console.log('=======================================');
