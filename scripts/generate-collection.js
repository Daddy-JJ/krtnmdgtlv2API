const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const sql = fs.readFileSync(path.join(root, 'krtnmdgtlv2.sql'), 'utf8');
const tables = [];
const pattern = /CREATE TABLE `([^`]+)` \(([\s\S]*?)\n\) ENGINE=/g;

function exampleFor(type, nullable) {
  if (nullable) return null;
  if (/int|decimal|double|float/.test(type)) return 1;
  if (/datetime|timestamp/.test(type)) return '2026-07-31 13:31:51';
  if (/date/.test(type)) return '2026-07-31';
  if (/text/.test(type)) return 'Contoh data';
  return 'contoh';
}

for (const match of sql.matchAll(pattern)) {
  const [, name, definition] = match;
  const columns = [];
  for (const line of definition.split('\n')) {
    const column = line.match(/^  `([^`]+)`\s+([^\s,]+)(.*?)(?:,)?$/);
    if (!column) continue;
    const [, columnName, type, attributes] = column;
    if (columnName === 'id' || /GENERATED ALWAYS/i.test(attributes)) continue;
    columns.push({
      name: columnName,
      value: exampleFor(type.toLowerCase(), /DEFAULT NULL/i.test(attributes))
    });
  }
  tables.push({ name, columns });
}

const request = (name, method, url, body) => ({
  name,
  request: {
    method,
    header: body ? [{ key: 'Content-Type', value: 'application/json' }] : [],
    url: { raw: `{{baseUrl}}${url}`, host: ['{{baseUrl}}'], path: url.split('/').filter(Boolean) },
    ...(body ? { body: { mode: 'raw', raw: JSON.stringify(body, null, 2), options: { raw: { language: 'json' } } } } : {})
  }
});

const collection = {
  info: {
    name: 'KartuNamaDigital API - krtnmdgtlv2',
    description: 'CRUD collection untuk semua tabel database krtnmdgtlv2. Sesuaikan body agar memenuhi foreign key dan unique constraint.',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
  },
  variable: [
    { key: 'baseUrl', value: 'http://localhost:3000/api/v1' },
    { key: 'id', value: '1' }
  ],
  item: [
    request('Health Check', 'GET', '/health'),
    {
      name: 'Authentication',
      item: [
        request('Register', 'POST', '/auth/register', { email: 'user@example.com', password: 'rahasia123' }),
        request('Login', 'POST', '/auth/login', { email: 'user@example.com', password: 'rahasia123' })
      ]
    },
    ...tables.map(({ name, columns }) => {
      const body = Object.fromEntries(columns.map((column) => [column.name, column.value]));
      return {
        name,
        item: [
          request(`List ${name}`, 'GET', `/${name}?page=1&limit=20&sort=id&order=desc`),
          request(`Get ${name} by ID`, 'GET', `/${name}/{{id}}`),
          request(`Create ${name}`, 'POST', `/${name}`, body),
          request(`Update ${name}`, 'PUT', `/${name}/{{id}}`, body),
          request(`Delete ${name}`, 'DELETE', `/${name}/{{id}}`)
        ]
      };
    })
  ]
};

fs.writeFileSync(path.join(root, 'collection.json'), `${JSON.stringify(collection, null, 2)}\n`);
console.log(`collection.json dibuat untuk ${tables.length} tabel.`);
