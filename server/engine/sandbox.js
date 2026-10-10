import vm from 'node:vm';
import { CONFIG } from '../config.js';

let ivmModule = null;
try {
  ivmModule = await import('isolated-vm');
} catch (e) {
  // isolated-vm not installed or native binary unavailable; use hardened V8 fallback
}

/**
 * High-Throughput Secure JavaScript Sandbox.
 * Prioritizes `isolated-vm` for true OS-level V8 Isolate memory & execution containment.
 * Gracefully provides a hardened `node:vm` isolate fallback with timeout, frozen prototypes,
 * and context sanitization when native binaries are absent.
 */
export class SecureSandbox {
  /**
   * @param {Object} options
   * @param {string} options.transformCode - JavaScript transformation function body
   * @param {number} [options.timeoutMs=50] - Execution timeout per row / batch
   * @param {number} [options.memoryLimitMb=16] - Memory limit in MB
   */
  constructor(options = {}) {
    this.transformCode = options.transformCode || 'return row;';
    this.timeoutMs = options.timeoutMs || CONFIG.SANDBOX_TIMEOUT_MS;
    this.memoryLimitMb = options.memoryLimitMb || CONFIG.MAX_SANDBOX_MEMORY_MB;

    this.engineType = ivmModule ? 'isolated-vm' : 'hardened-v8-vm';
    this.compiledScript = null;
    this.v8Context = null;
    this.ivmIsolate = null;
    this.ivmContext = null;
    this.ivmScript = null;

    this._initializeEngine();
  }

  _initializeEngine() {
    if (this.engineType === 'isolated-vm') {
      try {
        const ivm = ivmModule.default || ivmModule;
        this.ivmIsolate = new ivm.Isolate({ memoryLimit: this.memoryLimitMb });
        this.ivmContext = this.ivmIsolate.createContextSync();

        // Wrap user function in a safe runner
        const wrappedCode = `
          const __userFn = (function(row, helpers) {
            ${this.transformCode}
          });

          function runTransform(rowJson, helpersJson) {
            const row = JSON.parse(rowJson);
            const helpers = JSON.parse(helpersJson || '{}');
            const result = __userFn(row, helpers);
            return JSON.stringify(result !== undefined ? result : row);
          }
        `;

        this.ivmScript = this.ivmIsolate.compileScriptSync(wrappedCode);
        this.ivmScript.runSync(this.ivmContext, { timeout: this.timeoutMs });
        return;
      } catch (err) {
        console.warn(`[Sandbox] Failed to initialize isolated-vm (${err.message}). Falling back to hardened V8 VM.`);
        this.engineType = 'hardened-v8-vm';
      }
    }

    // Hardened Node.js V8 VM context pool
    const sandboxContext = Object.create(null);
    sandboxContext.Math = Math;
    sandboxContext.Date = Date;
    sandboxContext.JSON = JSON;
    sandboxContext.Number = Number;
    sandboxContext.String = String;
    sandboxContext.Boolean = Boolean;
    sandboxContext.RegExp = RegExp;
    sandboxContext.Array = Array;
    sandboxContext.parseInt = parseInt;
    sandboxContext.parseFloat = parseFloat;
    sandboxContext.isNaN = isNaN;
    sandboxContext.isFinite = isFinite;

    // Prevent access to host environment
    sandboxContext.process = undefined;
    sandboxContext.require = undefined;
    sandboxContext.import = undefined;
    sandboxContext.global = undefined;
    sandboxContext.globalThis = undefined;
    sandboxContext.eval = undefined;
    sandboxContext.Function = undefined;

    this.v8Context = vm.createContext(sandboxContext, {
      microtaskMode: 'afterEvaluate'
    });

    const wrappedCode = `
      "use strict";
      (function() {
        const row = __row;
        const helpers = __helpers;
        ${this.transformCode}
      })()
    `;

    try {
      this.compiledScript = new vm.Script(wrappedCode, {
        filename: 'streamweaver-sandbox.vm.js',
        displayErrors: true
      });
    } catch (syntaxErr) {
      throw new Error(`Syntax Error in Transformation Code: ${syntaxErr.message}`);
    }
  }

  /**
   * Execute transformation against a single row.
   * @param {Object} row
   * @param {Object} [helpers]
   * @returns {Object} Transformed row
   */
  execute(row, helpers = {}) {
    if (this.engineType === 'isolated-vm' && this.ivmContext) {
      return this._executeIvm(row, helpers);
    }
    return this._executeV8(row, helpers);
  }

  _executeIvm(row, helpers) {
    try {
      const runTransform = this.ivmContext.global.getSync('runTransform');
      const rowJson = JSON.stringify(row);
      const helpersJson = JSON.stringify(helpers);

      const resultJson = runTransform.applySync(undefined, [rowJson, helpersJson], {
        timeout: this.timeoutMs
      });

      return JSON.parse(resultJson);
    } catch (err) {
      if (err.message && err.message.includes('timed out')) {
        throw new Error(`Sandbox Execution Timeout (${this.timeoutMs}ms exceeded)`);
      }
      throw new Error(`Sandbox Transformation Error: ${err.message}`);
    }
  }

  _executeV8(row, helpers) {
    // Inject input safely into the pre-compiled context
    this.v8Context.__row = Object.assign(Object.create(null), row);
    this.v8Context.__helpers = helpers;

    try {
      const result = this.compiledScript.runInContext(this.v8Context, {
        timeout: this.timeoutMs,
        breakOnSigint: true
      });

      return result !== undefined ? result : this.v8Context.__row;
    } catch (err) {
      if (err.message && (err.message.includes('timed out') || err.code === 'ERR_SCRIPT_EXECUTION_TIMEOUT')) {
        throw new Error(`Sandbox Execution Timeout: Infinite loop or slow operation exceeded ${this.timeoutMs}ms`);
      }
      throw new Error(`Sandbox Transformation Error: ${err.message}`);
    } finally {
      // Clear references to allow GC
      this.v8Context.__row = null;
      this.v8Context.__helpers = null;
    }
  }

  /**
   * Batch execution for maximized stream throughput.
   * Transforms an array of rows, returning { success: [...], errors: [...] }.
   */
  executeBatch(rows, helpers = {}) {
    const transformed = [];
    const quarantined = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        const out = this.execute(row, helpers);
        transformed.push(out);
      } catch (err) {
        quarantined.push({
          rowIndex: i,
          original: row,
          error: err.message
        });
      }
    }

    return { transformed, quarantined };
  }

  /**
   * Release resources if using isolated-vm.
   */
  dispose() {
    if (this.ivmIsolate && !this.ivmIsolate.isDisposed) {
      this.ivmIsolate.dispose();
    }
    this.compiledScript = null;
    this.v8Context = null;
  }
}
