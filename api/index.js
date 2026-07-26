const { createNestApp } = require('../dist/src/main');

let cachedExpressApp = null;

module.exports = async (req, res) => {
  try {
    if (!cachedExpressApp) {
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
