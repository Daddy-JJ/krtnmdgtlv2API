import mysql, { type Pool } from 'mysql2/promise';
import type { Environment } from '../../config/environment.ts';

export function createDatabasePool(environment: Environment): Pool {
  const pool = mysql.createPool({
    host: environment.DB_HOST,
    port: environment.DB_PORT,
    user: environment.DB_USERNAME,
    password: environment.DB_PASSWORD,
    database: environment.DB_DATABASE,
    connectionLimit: environment.DB_CONNECTION_LIMIT,
    waitForConnections: true,
    enableKeepAlive: true,
    charset: 'utf8mb4',
    timezone: 'Z',
    ...(environment.DB_SOCKET ? { socketPath: environment.DB_SOCKET } : {}),
  });
  pool.on('connection', (connection) => {
    connection.query("SET time_zone = '+00:00'");
  });
  return pool;
}
