/**
 * Express application factory. Kept separate from server.js (which opens the
 * database and the port) so tests can import the app without side effects.
 */
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');

const { config } = require('./config/env');
const corsOptions = require('./config/cors');
const apiRoutes = require('./routes');
const notFound = require('./middleware/notFound');
const errorHandler = require('./middleware/errorHandler');

const FRONTEND_DIR = path.join(__dirname, '../frontend');

function createApp() {
  const app = express();

  // Security headers. The Content-Security-Policy only allows scripts from our own
  // origin, which is the main defence for the localStorage-JWT decision (XSS).
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          ...helmet.contentSecurityPolicy.getDefaultDirectives(),
          'img-src': ["'self'", 'data:'],
          // Would force https:// on http://localhost during development.
          'upgrade-insecure-requests': null,
        },
      },
    })
  );
  app.use(cors(corsOptions));
  app.use(express.json({ limit: '100kb' }));
  if (!config.isTest) app.use(morgan('dev'));

  // REST API
  app.use('/api', apiRoutes);

  // Frontend (static files). "/" serves the landing/login page.
  app.use('/vendor', express.static(path.join(__dirname, '../node_modules/chart.js/dist')));
  app.use(express.static(FRONTEND_DIR, { index: false }));
  app.get('/', (req, res) => res.sendFile(path.join(FRONTEND_DIR, 'pages', 'index.html')));

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

module.exports = createApp;
