const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { randomUUID } = require('node:crypto');
const { pool } = require('../config/database');
const HttpError = require('../lib/http-error');

function validateCredentials(body) {
  if (!body || Array.isArray(body) || typeof body !== 'object') {
    throw new HttpError(400, 'Body harus berupa object JSON');
  }
  const unknown = Object.keys(body).filter((key) => !['email', 'password'].includes(key));
  if (unknown.length) {
    throw new HttpError(400, 'Hanya email dan password yang diperbolehkan', { fields: unknown });
  }
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 190) {
    throw new HttpError(422, 'Format email tidak valid');
  }
  if (password.length < 8 || password.length > 72) {
    throw new HttpError(422, 'Password harus terdiri dari 8 sampai 72 karakter');
  }
  return { email, password };
}

function publicUser(user) {
  return {
    id: user.id,
    public_id: user.public_id,
    email: user.email,
    role: user.role,
    status: user.status,
    created_at: user.created_at
  };
}

function createAccessToken(user) {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('JWT_SECRET wajib diisi minimal 32 karakter');
  }
  return jwt.sign(
    { sub: String(user.id), public_id: user.public_id, role: user.role },
    secret,
    { expiresIn: process.env.JWT_EXPIRES_IN || '1h', issuer: 'kartunamadigital-api' }
  );
}

async function register(input) {
  const { email, password } = validateCredentials(input);
  const [existing] = await pool.query('SELECT id FROM users WHERE email = ? LIMIT 1', [email]);
  if (existing.length) throw new HttpError(409, 'Email sudah terdaftar');

  const passwordHash = await bcrypt.hash(password, Number(process.env.BCRYPT_ROUNDS || 12));
  const publicId = randomUUID();
  try {
    const [result] = await pool.query(
      `INSERT INTO users (public_id, email, password_hash, role, status, created_at, updated_at)
       VALUES (?, ?, ?, 'user', 'active', NOW(), NOW())`,
      [publicId, email, passwordHash]
    );
    const [rows] = await pool.query('SELECT * FROM users WHERE id = ? LIMIT 1', [result.insertId]);
    return { user: publicUser(rows[0]), accessToken: createAccessToken(rows[0]) };
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') throw new HttpError(409, 'Email sudah terdaftar');
    throw error;
  }
}

async function login(input) {
  const { email, password } = validateCredentials(input);
  const [rows] = await pool.query('SELECT * FROM users WHERE email = ? LIMIT 1', [email]);
  const user = rows[0];
  const valid = user && await bcrypt.compare(password, user.password_hash);
  if (!valid) throw new HttpError(401, 'Email atau password salah');
  if (user.status !== 'active') throw new HttpError(403, 'Akun tidak aktif');
  return { user: publicUser(user), accessToken: createAccessToken(user) };
}

module.exports = { register, login, validateCredentials, publicUser, createAccessToken };
