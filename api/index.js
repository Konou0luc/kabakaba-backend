const { createNestApp } = require('../dist/src/main');
const { getAllowedOrigins } = require('../dist/src/common/config/cors.config');

let cachedExpressApp = null;

function applyCors(req, res) {
  const origin = req.headers.origin;
  if (origin && getAllowedOrigins().includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Vary', 'Origin');
  }
}

module.exports = async (req, res) => {
  applyCors(req, res);

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  try {
    if (!cachedExpressApp) {
      process.env.VERCEL = '1';
      const app = await createNestApp();
      cachedExpressApp = app.getHttpAdapter().getInstance();
    }

    return new Promise((resolve, reject) => {
      cachedExpressApp(req, res, (err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    });
  } catch (error) {
    console.error('Vercel handler error:', error);
    if (!res.headersSent) {
      res.status(500).json({
        error: 'Internal server error',
        message: error?.message ?? String(error),
      });
    }
  }
};
