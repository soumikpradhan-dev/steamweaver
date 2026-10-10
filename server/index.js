import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONFIG } from './config.js';
import { registerUploadRoutes } from './routes/uploadRoute.js';
import { registerPreviewRoutes } from './routes/previewRoute.js';
import { registerPipelineRoutes } from './routes/pipelineRoute.js';
import { registerDatabaseRoutes } from './routes/databaseRoute.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.resolve(__dirname, '../public');

/**
 * High-performance, zero-external-dependency HTTP & SSE App Router.
 * Emulates Express interface while running natively on Node.js standard library.
 */
class StreamWeaverServer {
  constructor() {
    this.routes = { GET: [], POST: [], PUT: [], DELETE: [], OPTIONS: [] };
  }

  get(path, handler) { this._addRoute('GET', path, handler); }
  post(path, handler) { this._addRoute('POST', path, handler); }
  put(path, handler) { this._addRoute('PUT', path, handler); }
  delete(path, handler) { this._addRoute('DELETE', path, handler); }

  _addRoute(method, routePath, handler) {
    const paramNames = [];
    const regexPath = routePath.replace(/:([a-zA-Z0-9_]+)/g, (_, name) => {
      paramNames.push(name);
      return '([^/]+)';
    });
    this.routes[method].push({
      pattern: new RegExp(`^${regexPath}$`),
      paramNames,
      handler
    });
  }

  async handleRequest(req, res) {
    // 1. CORS Headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, uploadId, chunkIndex, totalChunks, fileName');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      return res.end();
    }

    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = parsedUrl.pathname;

    // Attach express-like helpers
    req.query = Object.fromEntries(parsedUrl.searchParams.entries());
    res.json = (data) => {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(data));
    };
    res.status = (code) => {
      res.statusCode = code;
      return res;
    };

    // Match API routes
    const methodRoutes = this.routes[req.method] || [];
    for (const route of methodRoutes) {
      const match = pathname.match(route.pattern);
      if (match) {
        req.params = {};
        route.paramNames.forEach((name, idx) => {
          req.params[name] = decodeURIComponent(match[idx + 1]);
        });

        // Parse JSON body for POST/PUT if Content-Type is application/json
        const contentType = req.headers['content-type'] || '';
        if (contentType.includes('application/json')) {
          let bodyData = '';
          req.on('data', chunk => { bodyData += chunk; });
          req.on('end', () => {
            try {
              req.body = bodyData ? JSON.parse(bodyData) : {};
            } catch (err) {
              req.body = {};
            }
            route.handler(req, res);
          });
          return;
        }

        req.body = {};
        return route.handler(req, res);
      }
    }

    // Serve static client assets from /public
    if (req.method === 'GET') {
      let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const ext = path.extname(filePath).toLowerCase();
        const mimeTypes = {
          '.html': 'text/html',
          '.js': 'application/javascript',
          '.css': 'text/css',
          '.json': 'application/json',
          '.svg': 'image/svg+xml',
          '.png': 'image/png'
        };
        res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
        fs.createReadStream(filePath).pipe(res);
        return;
      }
    }

    // Default 404
    res.status(404).json({ error: `Not Found: ${pathname}` });
  }

  listen(port, host, callback) {
    const server = http.createServer((req, res) => this.handleRequest(req, res));
    return server.listen(port, host, callback);
  }
}

// Instantiate server
const app = new StreamWeaverServer();

// Register all modular API routes
registerUploadRoutes(app);
registerPreviewRoutes(app);
registerPipelineRoutes(app);
registerDatabaseRoutes(app);

// Start listening
const server = app.listen(CONFIG.PORT, CONFIG.HOST, () => {
  console.log(`=======================================================`);
  console.log(`🚀 StreamWeaver ETL Pipeline Engine Online`);
  console.log(`📡 URL: http://localhost:${CONFIG.PORT}`);
  console.log(`⚙️  Node.js V8 Engine: ${process.version}`);
  console.log(`📁 Upload Directory: ${CONFIG.UPLOAD_DIR}`);
  console.log(`💾 Output Directory: ${CONFIG.OUTPUT_DIR}`);
  console.log(`=======================================================`);
});

export { app, server };
