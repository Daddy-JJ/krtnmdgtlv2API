import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

export function contractDatabase(root) {
  if (process.argv.includes('--test-database')) {
    const name = process.env.TEST_DB_DATABASE ?? '';
    if (process.env.RUN_DB_TESTS !== 'true' || !/_test$/i.test(name) || name === process.env.DB_DATABASE) throw new Error('Explicit isolated test database required for contract generation.');
    return { host:process.env.TEST_DB_HOST??'127.0.0.1',port:Number(process.env.TEST_DB_PORT??3306),user:process.env.TEST_DB_USERNAME??'root',password:process.env.TEST_DB_PASSWORD??'',database:name };
  }
  const path = resolve(root,'.env');
  if (existsSync(path)) process.loadEnvFile(path);
  return {host:process.env.DB_HOST??'127.0.0.1',port:Number(process.env.DB_PORT??3306),user:process.env.DB_USERNAME,password:process.env.DB_PASSWORD??'',database:process.env.DB_DATABASE};
}
