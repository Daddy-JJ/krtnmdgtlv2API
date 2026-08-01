const auth = require('../services/auth.service');

async function register(req, res) {
  const result = await auth.register(req.body);
  res.status(201).json({
    success: true,
    message: 'Registrasi berhasil',
    data: { ...result, tokenType: 'Bearer', expiresIn: process.env.JWT_EXPIRES_IN || '1h' }
  });
}

async function login(req, res) {
  const result = await auth.login(req.body);
  res.json({
    success: true,
    message: 'Login berhasil',
    data: { ...result, tokenType: 'Bearer', expiresIn: process.env.JWT_EXPIRES_IN || '1h' }
  });
}

module.exports = { register, login };
