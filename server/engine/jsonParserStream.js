import { Transform } from 'node:stream';

/**
 * Streaming JSON / NDJSON parser using native Node.js stream.Transform.
 * Efficiently streams records from NDJSON or JSON array streams.
 */
export class JsonParserStream extends Transform {
  /**
   * @param {Object} options
   * @param {number} [options.maxRows]
   */
  constructor(options = {}) {
    super({ objectMode: true, highWaterMark: 16384 });

    this.maxRows = options.maxRows || Infinity;
    this.buffer = '';
    this.rowCount = 0;
    this.hasEnded = false;
    this.isArrayMode = null;
  }

  _transform(chunk, encoding, callback) {
    if (this.hasEnded) return callback();

    this.buffer += chunk.toString('utf8');

    // Detect format from start of buffer if not yet determined
    if (this.isArrayMode === null) {
      const trimmed = this.buffer.trim();
      if (trimmed.startsWith('[')) {
        this.isArrayMode = true;
        // strip opening bracket
        const idx = this.buffer.indexOf('[');
        this.buffer = this.buffer.slice(idx + 1);
      } else if (trimmed.length > 0) {
        this.isArrayMode = false;
      }
    }

    if (this.isArrayMode) {
      this._parseJsonArrayChunk();
    } else {
      this._parseNdjsonChunk();
    }

    callback();
  }

  _parseNdjsonChunk() {
    const lines = this.buffer.split(/\r?\n/);
    this.buffer = lines.pop() || '';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      try {
        const doc = JSON.parse(line);
        this.rowCount++;
        this.push(doc);

        if (this.rowCount >= this.maxRows) {
          this.hasEnded = true;
          this.push(null);
          return;
        }
      } catch (err) {
        // Skip malformed individual line in NDJSON stream
      }
    }
  }

  _parseJsonArrayChunk() {
    let braceCount = 0;
    let inString = false;
    let escape = false;
    let startIdx = -1;

    for (let i = 0; i < this.buffer.length; i++) {
      const ch = this.buffer[i];

      if (escape) {
        escape = false;
        continue;
      }

      if (ch === '\\' && inString) {
        escape = true;
        continue;
      }

      if (ch === '"') {
        inString = !inString;
        continue;
      }

      if (!inString) {
        if (ch === '{') {
          if (braceCount === 0) startIdx = i;
          braceCount++;
        } else if (ch === '}') {
          braceCount--;
          if (braceCount === 0 && startIdx !== -1) {
            const jsonStr = this.buffer.slice(startIdx, i + 1);
            try {
              const doc = JSON.parse(jsonStr);
              this.rowCount++;
              this.push(doc);

              if (this.rowCount >= this.maxRows) {
                this.hasEnded = true;
                this.push(null);
                this.buffer = '';
                return;
              }
            } catch (err) {
              // ignore malformed element
            }
            startIdx = -1;
            // update buffer start
            this.buffer = this.buffer.slice(i + 1);
            i = -1; // reset loop
          }
        }
      }
    }
  }

  _flush(callback) {
    if (this.hasEnded) return callback();

    const remaining = this.buffer.trim();
    if (remaining && !this.isArrayMode) {
      try {
        const doc = JSON.parse(remaining);
        this.rowCount++;
        this.push(doc);
      } catch (err) {}
    }

    callback();
  }
}
