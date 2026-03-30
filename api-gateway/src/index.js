/**
 * API GATEWAY
 *
 * In microservices, clients NEVER call individual services directly.
 * All traffic enters through the API Gateway which:
 *   1. Routes requests to the correct service
 *   2. Is the only public-facing component
 *   3. Can handle auth, rate limiting, logging (we keep it simple here)
 *
 * Real-world equivalents: AWS API Gateway, Kong, NGINX, Traefik
 */

const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const morgan = require('morgan');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// CORS — allow the React frontend (any origin in dev, lock down in prod)
app.use(cors());

// HTTP request logger — shows every incoming request
app.use(morgan('dev'));

// ─────────────────────────────────────────────────────────────────
// ROUTING TABLE
// The gateway knows where each service lives.
// Services don't know about each other — only the gateway does.
// ─────────────────────────────────────────────────────────────────

// All /orders/* requests → Order Service
app.use(
  '/orders',
  createProxyMiddleware({
    target: process.env.ORDER_SERVICE_URL || 'http://localhost:3001',
    changeOrigin: true,
    on: {
      error: (err, req, res) => {
        console.error('[Gateway] Order service unreachable:', err.message);
        res.status(503).json({ error: 'Order service unavailable' });
      },
    },
  })
);

// All /inventory/* requests → Inventory Service
app.use(
  '/inventory',
  createProxyMiddleware({
    target: process.env.INVENTORY_SERVICE_URL || 'http://localhost:3003',
    changeOrigin: true,
    on: {
      error: (err, req, res) => {
        console.error('[Gateway] Inventory service unreachable:', err.message);
        res.status(503).json({ error: 'Inventory service unavailable' });
      },
    },
  })
);

// Health check — load balancers ping this to know if gateway is alive
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'api-gateway', timestamp: new Date() });
});

// Catch-all for unknown routes
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
});

app.listen(PORT, () => {
  console.log(`[API Gateway] Running on port ${PORT}`);
  console.log(`[API Gateway] Routes:`);
  console.log(`  /orders  → ${process.env.ORDER_SERVICE_URL || 'http://localhost:3001'}`);
});
