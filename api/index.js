const { createNestApp } = require('../dist/src/main');

let cachedApp = null;

module.exports = async (req, res) => {
  try {
    if (!cachedApp) {
      cachedApp = await createNestApp();
    }
    cachedApp.getHttpAdapter().getInstance()(req, res);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
};
