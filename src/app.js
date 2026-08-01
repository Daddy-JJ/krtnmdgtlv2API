require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const api = require('./routes/api');
const auth = require('./routes/auth');

const app = express();
app.disable('x-powered-by');
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN === '*' ? '*' : process.env.CORS_ORIGIN?.split(',') }));
app.use(express.json({ limit: '1mb' }));
app.get('/', (req, res) => res.json({ name: 'KartuNamaDigital REST API', version: '1.0.0', docs: '/api/v1/health' }));
app.use('/api/v1/auth', auth);
app.use('/api/v1', api);
app.use((req, res) => res.status(404).json({ success: false, message: 'Endpoint tidak ditemukan' }));
app.use((error, req, res, next) => {
  const status = error.status || (error.code?.startsWith('ER_') ? 422 : 500);
  const response = { success: false, message: status === 500 ? 'Terjadi kesalahan pada server' : error.message };
  if (error.details) response.details = error.details;
  if (process.env.NODE_ENV !== 'production' && status === 500) response.error = error.message;
  res.status(status).json(response);
});

module.exports = app;
