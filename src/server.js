require('dotenv').config();
const app = require('./app');
const { pool, databaseName } = require('./config/database');

const port = Number(process.env.PORT || 3000);

async function start() {
  await pool.query('SELECT 1');
  app.listen(port, () => console.log(`API database ${databaseName} berjalan di http://localhost:${port}`));
}

start().catch((error) => {
  console.error('Gagal terhubung ke database:', error.message);
  process.exit(1);
});
