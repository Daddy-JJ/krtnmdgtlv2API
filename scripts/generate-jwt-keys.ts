import { generateKeyPairSync } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const directory = resolve(import.meta.dirname, '../storage/private');
const privatePath = resolve(directory, 'jwt-private.pem');
const publicPath = resolve(directory, 'jwt-public.pem');
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 3072 });
await mkdir(directory, { recursive: true });
await writeFile(privatePath, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600, flag: 'wx' });
await writeFile(publicPath, publicKey.export({ type: 'spki', format: 'pem' }), { mode: 0o644, flag: 'wx' });
process.stdout.write('JWT key pair generated in backend/storage/private.\n');
