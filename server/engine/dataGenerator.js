import fs from 'node:fs';
import { Readable } from 'node:stream';

const FIRST_NAMES = ['James', 'Mary', 'Robert', 'Patricia', 'John', 'Jennifer', 'Michael', 'Linda', 'David', 'Elizabeth', 'William', 'Barbara', 'Richard', 'Susan', 'Joseph', 'Jessica'];
const LAST_NAMES = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson'];
const CATEGORIES = ['Electronics', 'Home & Kitchen', 'Books', 'Apparel', 'Automotive', 'Health & Beauty', 'Sports & Outdoors'];
const STATUSES = ['PENDING', 'COMPLETED', 'SHIPPED', 'CANCELLED', 'REFUNDED'];

/**
 * High-speed synthetic CSV / JSON data generator.
 * Emits records piece-by-piece via Node.js Readable stream.
 */
export class SyntheticDataGenerator extends Readable {
  /**
   * @param {Object} options
   * @param {number} [options.totalRows=100000] - Rows to generate
   * @param {string} [options.format='csv'] - 'csv' | 'json' | 'ndjson'
   */
  constructor(options = {}) {
    super({ highWaterMark: 64 * 1024 });

    this.totalRows = options.totalRows || 100000;
    this.format = options.format || 'csv';
    this.currentRow = 0;
    this.headerEmitted = false;
  }

  _read(size) {
    let ok = true;

    // Emit CSV header if needed
    if (!this.headerEmitted) {
      if (this.format === 'csv') {
        ok = this.push('transaction_id,customer_name,email,category,amount,quantity,status,created_at,notes\n');
      } else if (this.format === 'json') {
        ok = this.push('[\n');
      }
      this.headerEmitted = true;
      if (!ok) return;
    }

    // Batch chunk generation to maximize throughput
    const chunkSize = 500;
    while (ok && this.currentRow < this.totalRows) {
      let chunk = '';
      const limit = Math.min(this.currentRow + chunkSize, this.totalRows);

      for (; this.currentRow < limit; this.currentRow++) {
        const id = 1000000 + this.currentRow;
        const fn = FIRST_NAMES[this.currentRow % FIRST_NAMES.length];
        const ln = LAST_NAMES[(this.currentRow * 3) % LAST_NAMES.length];
        const name = `${fn} ${ln}`;
        const email = `${fn.toLowerCase()}.${ln.toLowerCase()}${id % 99}@example.com`;
        const cat = CATEGORIES[(this.currentRow * 7) % CATEGORIES.length];
        const amount = (10 + (this.currentRow % 990) + (this.currentRow % 100) / 100).toFixed(2);
        const qty = 1 + (this.currentRow % 10);
        const status = STATUSES[this.currentRow % STATUSES.length];
        const date = new Date(Date.now() - (this.currentRow * 60000)).toISOString();
        const notes = `Order #${id} processed via automated gateway`;

        if (this.format === 'csv') {
          chunk += `TXN-${id},"${name}",${email},"${cat}",${amount},${qty},${status},${date},"${notes}"\n`;
        } else if (this.format === 'ndjson') {
          chunk += JSON.stringify({
            transaction_id: `TXN-${id}`,
            customer_name: name,
            email,
            category: cat,
            amount: parseFloat(amount),
            quantity: qty,
            status,
            created_at: date,
            notes
          }) + '\n';
        } else if (this.format === 'json') {
          const isLast = this.currentRow === this.totalRows - 1;
          chunk += JSON.stringify({
            transaction_id: `TXN-${id}`,
            customer_name: name,
            email,
            category: cat,
            amount: parseFloat(amount),
            quantity: qty,
            status,
            created_at: date,
            notes
          }) + (isLast ? '\n' : ',\n');
        }
      }

      ok = this.push(chunk);
    }

    if (this.currentRow >= this.totalRows) {
      if (this.format === 'json') {
        this.push(']\n');
      }
      this.push(null); // End of stream
    }
  }

  /**
   * Helper to write directly to a file on disk
   * @param {string} destinationPath
   * @param {number} rowCount
   * @param {string} [format='csv']
   * @returns {Promise<{ filePath: string, sizeBytes: number, durationMs: number }>}
   */
  static async generateToFile(destinationPath, rowCount = 100000, format = 'csv') {
    const startTime = performance.now();
    const generator = new SyntheticDataGenerator({ totalRows: rowCount, format });
    const writeStream = fs.createWriteStream(destinationPath);

    await new Promise((resolve, reject) => {
      generator.pipe(writeStream);
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
      generator.on('error', reject);
    });

    const stat = fs.statSync(destinationPath);
    return {
      filePath: destinationPath,
      sizeBytes: stat.size,
      durationMs: Math.round(performance.now() - startTime)
    };
  }
}
