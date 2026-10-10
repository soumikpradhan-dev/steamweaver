import { Transform } from 'node:stream';

/**
 * High-performance, streaming CSV parser using native Node.js stream.Transform.
 * Handles quoted cells with embedded commas and escaped quotes without loading
 * the entire file into memory.
 */
export class CsvParserStream extends Transform {
  /**
   * @param {Object} options
   * @param {string[]} [options.headers] - Pre-defined headers. If omitted, line 1 is treated as header.
   * @param {string} [options.delimiter=','] - Column delimiter
   * @param {number} [options.maxRows] - Stop after maxRows (useful for previewing top 100 rows)
   */
  constructor(options = {}) {
    super({ objectMode: true, highWaterMark: 16384 });

    this.delimiter = options.delimiter || ',';
    this.customHeaders = options.headers || null;
    this.maxRows = options.maxRows || Infinity;

    this.headers = this.customHeaders;
    this.buffer = '';
    this.rowCount = 0;
    this.isFirstLine = true;
    this.hasEnded = false;
  }

  _transform(chunk, encoding, callback) {
    if (this.hasEnded) {
      return callback();
    }

    this.buffer += chunk.toString('utf8');
    const lines = this.buffer.split(/\r?\n/);

    // Keep the last partial line in the buffer
    this.buffer = lines.pop() || '';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      if (!this.headers) {
        this.headers = this._parseCsvLine(line).map(h => h.trim());
        continue;
      }

      const values = this._parseCsvLine(line);
      const row = {};
      for (let j = 0; j < this.headers.length; j++) {
        row[this.headers[j]] = values[j] !== undefined ? values[j] : '';
      }

      this.rowCount++;
      this.push(row);

      if (this.rowCount >= this.maxRows) {
        this.hasEnded = true;
        this.push(null);
        return callback();
      }
    }

    callback();
  }

  _flush(callback) {
    if (this.hasEnded) {
      return callback();
    }

    const remaining = this.buffer.trim();
    if (remaining) {
      if (!this.headers) {
        this.headers = this._parseCsvLine(remaining).map(h => h.trim());
      } else {
        const values = this._parseCsvLine(remaining);
        const row = {};
        for (let j = 0; j < this.headers.length; j++) {
          row[this.headers[j]] = values[j] !== undefined ? values[j] : '';
        }
        this.rowCount++;
        this.push(row);
      }
    }

    callback();
  }

  /**
   * Fast finite-state-machine CSV line tokenizer.
   * Handles quoted commas, double quote escapes (""), and trim.
   */
  _parseCsvLine(text) {
    const fields = [];
    let field = '';
    let inQuotes = false;
    const len = text.length;
    const delim = this.delimiter;

    for (let i = 0; i < len; i++) {
      const char = text[i];

      if (char === '"') {
        if (inQuotes && text[i + 1] === '"') {
          field += '"';
          i++; // skip escaped quote
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === delim && !inQuotes) {
        fields.push(field);
        field = '';
      } else {
        field += char;
      }
    }

    fields.push(field);
    return fields;
  }
}
