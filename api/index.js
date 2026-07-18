require('ts-node/register');
const { createNestApp } = require('../src/main');

let cachedApp = null;

module.exports = async (req, res) => {
  if (!cachedApp) {
    cachedApp = await createNestApp();
  }
  cachedApp.getHttpAdapter().getInstance()(req, res);
};
