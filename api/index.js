const express = require('express');
const { createNestApp } = require('../dist/src/main');

let cachedApp = null;
let cachedExpressApp = null;

module.exports = async (req, res) => {
  try {
    if (!cachedApp) {
      cachedApp = await createNestApp();
      cachedExpressApp = cachedApp.getHttpAdapter().getInstance();
    }

    if (!cachedExpressApp) {
      throw new Error('Nest Express app not initialized');
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
    console.error(error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
};
