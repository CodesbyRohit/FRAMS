const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const { HttpError } = require('./lib/http');

const DEFAULT_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173'];

const createApp = () => {
  const app = express();
  app.disable('x-powered-by');
  if (process.env.TRUST_PROXY) app.set('trust proxy', process.env.TRUST_PROXY);

  // Enrollment photos are the largest payload (≈1 MB base64); the old 50 MB limit invited abuse.
  app.use(express.json({ limit: '2mb' }));

  if (process.env.NODE_ENV === 'development') app.use(morgan('dev'));

  const origins = process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',').map((s) => s.trim()) : DEFAULT_ORIGINS;
  app.use(cors({ origin: origins }));

  app.use((req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
    });
    next();
  });

  app.use('/api/auth', require('./routes/authRoutes'));
  app.use('/api/users', require('./routes/userRoutes'));
  app.use('/api/attendance', require('./routes/attendanceRoutes'));
  app.use('/api', require('./routes/miscRoutes'));

  app.use('/api', (req, res) => res.status(404).json({ message: 'Not found' }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof HttpError) {
      return res.status(err.status).json({ message: err.message, ...(err.details ? { details: err.details } : {}) });
    }
    if (err.type === 'entity.too.large') return res.status(413).json({ message: 'Request is too large' });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ message: 'Request body is not valid JSON' });
    if (err.name === 'ValidationError') return res.status(400).json({ message: err.message });
    if (err.name === 'CastError') return res.status(400).json({ message: 'Invalid identifier' });
    console.error('[ERROR]', err);
    res.status(500).json({
      message: 'Something went wrong on the server',
      ...(process.env.NODE_ENV === 'development' ? { stack: err.stack } : {}),
    });
  });

  return app;
};

module.exports = { createApp };
