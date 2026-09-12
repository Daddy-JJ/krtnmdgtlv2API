import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import mysql from 'mysql2/promise';
import {
  ADMIN_DATA_RESOURCES,
  isSensitiveAdminDataColumn,
} from '../src/modules/admin-data/resources/admin-data-resources.ts';

const root = resolve(import.meta.dirname, '..');
process.loadEnvFile(resolve(root, '.env'));

const connection = await mysql.createConnection({
  host: process.env.DB_HOST ?? '127.0.0.1',
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD ?? '',
  database: process.env.DB_DATABASE,
});

const [columnRows] = await connection.execute(
  `SELECT TABLE_NAME AS tableName,COLUMN_NAME AS name,DATA_TYPE AS dataType,
          COLUMN_TYPE AS columnType,IS_NULLABLE AS nullable,COLUMN_DEFAULT AS defaultValue,
          COLUMN_KEY AS columnKey,EXTRA AS extra,CHARACTER_MAXIMUM_LENGTH AS maximumLength
   FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA=DATABASE()
   ORDER BY TABLE_NAME,ORDINAL_POSITION`,
);
const [tableRows] = await connection.execute(
  `SELECT TABLE_NAME AS tableName FROM INFORMATION_SCHEMA.TABLES
   WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME`,
);
await connection.end();

const allowed = new Set(ADMIN_DATA_RESOURCES);
const applicationTables = tableRows.map((row) => row.tableName).filter((name) => name !== 'schema_migrations');
const missing = ADMIN_DATA_RESOURCES.filter((name) => !applicationTables.includes(name));
const unregistered = applicationTables.filter((name) => !allowed.has(name));
if (missing.length || unregistered.length) {
  throw new Error(`CRUD/schema drift. Missing: ${missing.join(', ') || '-'}; unregistered: ${unregistered.join(', ') || '-'}.`);
}
const schemas = new Map(ADMIN_DATA_RESOURCES.map((resource) => [resource, []]));
for (const row of columnRows) {
  if (allowed.has(row.tableName)) schemas.get(row.tableName).push(row);
}

function variableName(resource) {
  return `${resource.replace(/_([a-z])/g, (_match, letter) => letter.toUpperCase())}Identifier`;
}

function exampleValue(column) {
  const name = String(column.name);
  const type = String(column.dataType);
  const maximumLength = column.maximumLength === null ? null : Number(column.maximumLength);
  if (name.endsWith('_hash') || name === 'sha256') return '0'.repeat(Math.min(maximumLength ?? 64, 64));
  if (name.includes('email')) return 'admin-data@example.test';
  if (name.endsWith('_url')) return 'https://example.test/resource';
  if (name === 'currency') return 'IDR';
  if (name.includes('status')) return 'active';
  if (name === 'role') return 'member';
  if (name === 'locale') return 'id';
  if (column.columnType === 'tinyint(1)') return true;
  if (['tinyint', 'smallint', 'mediumint', 'int', 'integer', 'bigint', 'year'].includes(type)) return 1;
  if (['decimal', 'numeric', 'float', 'double', 'real'].includes(type)) return 1;
  if (type === 'date') return '2026-09-01';
  if (['datetime', 'timestamp'].includes(type)) return '2026-09-01 12:00:00';
  if (type === 'time') return '12:00:00';
  if (type === 'json') return {};
  if (maximumLength === 36) return '00000000-0000-4000-8000-000000000001';
  return 'example';
}

function createBody(columns) {
  const body = {};
  for (const column of columns) {
    const extra = String(column.extra).toLowerCase();
    const automatic = extra.includes('auto_increment') || extra.includes('generated')
      || column.name === 'public_id' || column.name === 'created_at' || column.name === 'updated_at';
    const required = column.nullable === 'NO' && column.defaultValue === null;
    if (!automatic && required) body[column.name] = exampleValue(column);
  }
  return body;
}

function updateBody(columns) {
  const writable = (candidate) => {
    const extra = String(candidate.extra).toLowerCase();
    return candidate.columnKey !== 'PRI'
      && !extra.includes('auto_increment')
      && !extra.includes('generated')
      && candidate.name !== 'updated_at'
      && !isSensitiveAdminDataColumn(candidate.name);
  };
  const column = columns.find((candidate) => writable(candidate) && candidate.name !== 'created_at')
    ?? columns.find(writable);
  return column ? { [column.name]: exampleValue(column) } : {};
}

function url(path) {
  return { raw: `{{baseUrl}}${path}`, host: ['{{baseUrl}}'], path: path.split('/').filter(Boolean) };
}

function request(name, method, path, options = {}) {
  const headers = [];
  if (options.csrf) headers.push({ key: 'X-CSRF-Token', value: '{{csrfToken}}', type: 'text' });
  if (options.body) headers.push({ key: 'Content-Type', value: 'application/json', type: 'text' });
  return {
    name,
    request: {
      method,
      header: headers,
      url: url(path),
      ...(options.body ? { body: { mode: 'raw', raw: JSON.stringify(options.body, null, 2), options: { raw: { language: 'json' } } } } : {}),
      description: options.description ?? '',
    },
    ...(options.tests ? { event: [{ listen: 'test', script: { type: 'text/javascript', exec: options.tests } }] } : {}),
  };
}

const resourceItems = [];
const identifierVariables = [];
for (const resource of ADMIN_DATA_RESOURCES) {
  const columns = schemas.get(resource);
  if (!columns || columns.length === 0) throw new Error(`Database metadata is missing for ${resource}.`);
  const primaryKey = columns.filter((column) => column.columnKey === 'PRI').map((column) => column.name);
  if (primaryKey.length === 0) throw new Error(`Primary key is missing for ${resource}.`);
  const variable = variableName(resource);
  identifierVariables.push({ key: variable, value: primaryKey.map(() => '1').join('~') });
  const createTests = [
    'if (pm.response.code === 201) {',
    '  const data = pm.response.json().data;',
    `  const value = ${JSON.stringify(primaryKey)}.map((key) => encodeURIComponent(String(data[key]))).join('~');`,
    `  pm.collectionVariables.set('${variable}', value);`,
    '}',
  ];
  resourceItems.push({
    name: resource,
    description: `Administrative CRUD for ${resource}. Primary key format: ${primaryKey.join('~')}.`,
    item: [
      request(`List ${resource}`, 'GET', `/admin/data/${resource}?page=1&limit=20&order=desc`),
      request(`Get ${resource}`, 'GET', `/admin/data/${resource}/{{${variable}}}`),
      request(`Create ${resource}`, 'POST', `/admin/data/${resource}`, { body: createBody(columns), csrf: true, tests: createTests }),
      request(`Update ${resource}`, 'PUT', `/admin/data/${resource}/{{${variable}}}`, { body: updateBody(columns), csrf: true }),
      request(`Delete ${resource}`, 'DELETE', `/admin/data/${resource}/{{${variable}}}`, { csrf: true }),
    ],
  });
}

const collection = {
  info: {
    name: 'KartuNamaDigital REST API - Local',
    description: 'Node.js + Express REST API collection. Administrative table CRUD requires a super-admin session, data.read/data.manage permissions, and CSRF for mutations.',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  },
  variable: [
    { key: 'baseUrl', value: 'http://127.0.0.1:3000/api/v1' },
    { key: 'adminEmail', value: 'admin@kartunamadigital.id' },
    { key: 'adminPassword', value: '' },
    { key: 'csrfToken', value: '' },
    { key: 'starterPublicId', value: '' },
    { key: 'starterEmailToken', value: '' },
    { key: 'starterEmail', value: '' },
    { key: 'starterSlug', value: '' },
    ...identifierVariables,
  ],
  item: [
    { name: 'System', item: [request('Health Check', 'GET', '/health')] },
    {
      name: 'Starter',
      description: 'Create attempts SMTP delivery immediately. emailSent means SMTP accepted, not inbox delivery. Access exchanges the email fragment token once; keep the cookie jar enabled.',
      item: [
        request('Create Starter Card', 'POST', '/starter/cards', {
          body: { locale: 'id', contact: { fullName: 'Test Starter', jobTitle: '', organization: '', officePhone: '021123456', mobilePhone: '08123456789', email: '{{starterEmail}}', websiteUrl: '', addressText: 'Jakarta' } },
          tests: ["if (pm.response.code === 201) { const d = pm.response.json().data; pm.collectionVariables.set('starterPublicId', d.publicId); pm.collectionVariables.set('starterSlug', d.slug); pm.test('Starter slug is exactly seven ASCII letters', () => pm.expect(d.slug).to.match(/^[A-Za-z]{7}$/)); pm.test('Email status is explicit', () => pm.expect(d.emailSent).to.be.a('boolean')); }"],
        }),
        request('Open Starter Email Access', 'POST', '/starter/access', { body: { publicId: '{{starterPublicId}}', token: '{{starterEmailToken}}' } }),
        request('Read Starter Signup Context', 'GET', '/starter/cards/{{starterPublicId}}/signup-context'),
        request('Read Public Starter Card', 'GET', '/public/cards/{{starterSlug}}', {
          tests: ["if (pm.response.code === 200) pm.test('Starter has no WhatsApp CTA', () => pm.expect(pm.response.json().data.whatsappUrl).to.eql(null));"],
        }),
      ],
    },
    {
      name: 'Authentication',
      item: [
        request('Admin Login', 'POST', '/auth/login', { body: { email: '{{adminEmail}}', password: '{{adminPassword}}' } }),
        request('Issue CSRF Token', 'GET', '/auth/csrf', {
          tests: [
            'if (pm.response.code === 200) {',
            "  pm.collectionVariables.set('csrfToken', pm.response.json().data.csrfToken);",
            '}',
          ],
        }),
      ],
    },
    {
      name: 'Administrative Data CRUD',
      description: 'Run Admin Login and Issue CSRF Token first. Composite primary keys use ~ between key components.',
      item: [request('Resource Catalog', 'GET', '/admin/data'), ...resourceItems],
    },
  ],
};

const output = `${JSON.stringify(collection, null, 2)}\n`;
await mkdir(resolve(root, 'docs'), { recursive: true });
await Promise.all([
  writeFile(resolve(root, 'collection.json'), output),
  writeFile(resolve(root, 'docs/collection.json'), output),
]);
process.stdout.write(`collection.json generated for ${ADMIN_DATA_RESOURCES.length} administrative resources.\n`);
