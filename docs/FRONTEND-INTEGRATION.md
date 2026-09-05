# Frontend Integration

## Local endpoints

```text
Frontend origin : http://127.0.0.1:8080
API base URL    : http://127.0.0.1:3000/api/v1
Health endpoint : http://127.0.0.1:3000/api/v1/health
```

Jangan mengirim request API ke port `8080`; port tersebut dilayani frontend.
HTML 404 dari port `8080` berarti request tidak pernah mencapai Express.

Simpan API base URL pada environment frontend, misalnya:

```ini
VITE_API_BASE_URL=http://127.0.0.1:3000/api/v1
```

Nama environment dapat disesuaikan dengan framework frontend. Hindari menulis
base URL berulang di setiap component.

## Fetch client minimum

Backend memakai cookie untuk access dan refresh token. Semua request session
dari frontend harus memakai `credentials: 'include'`.

```ts
const API_BASE_URL = 'http://127.0.0.1:3000/api/v1';

export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...init.headers,
    },
  });

  const payload = await response.json();
  if (!response.ok) throw payload;
  return payload as T;
}
```

Tambahkan `Content-Type: application/json` hanya untuk JSON. Jangan menetapkan
header tersebut secara manual ketika body berupa `FormData`, karena browser
harus membuat multipart boundary.

## Authentication dan CSRF

Urutan session:

1. `POST /auth/login` dengan email dan password.
2. Browser menerima cookie `access_token`, `refresh_token`, dan `csrf_token`.
3. `GET /auth/csrf` untuk mendapatkan token CSRF session saat ini.
4. Simpan `data.csrfToken` hanya di memory aplikasi.
5. Kirim `X-CSRF-Token` pada setiap POST, PUT, PATCH, dan DELETE authenticated.
6. Jika access token kedaluwarsa, panggil `POST /auth/refresh` dengan CSRF.
7. Setelah refresh, gunakan CSRF baru karena session credential dirotasi.
8. `POST /auth/logout` juga memerlukan CSRF.

Contoh mutation:

```ts
await apiRequest('/me', {
  method: 'PUT',
  headers: {
    'Content-Type': 'application/json',
    'X-CSRF-Token': csrfToken,
  },
  body: JSON.stringify({ email: 'user@example.com' }),
});
```

Jangan menyimpan access token atau refresh token ke localStorage. Keduanya
HttpOnly dan dikelola cookie jar browser.

## CORS

Konfigurasi backend lokal harus memuat exact frontend origin:

```ini
CORS_ALLOWED_ORIGINS=http://127.0.0.1:8080,http://localhost:8080
```

Origin harus cocok pada scheme, hostname, dan port. `localhost` berbeda dengan
`127.0.0.1`. Backend tidak menggunakan wildcard karena request membawa cookie.

## Response contract

Response sukses menggunakan envelope:

```json
{
  "success": true,
  "message": "Records retrieved.",
  "data": {}
}
```

List dapat memiliki metadata pagination:

```json
{
  "success": true,
  "message": "Records retrieved.",
  "data": [],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 0,
    "pages": 0
  }
}
```

Response error umum:

```json
{
  "success": false,
  "message": "Authentication is required.",
  "code": "AUTH_REQUIRED",
  "data": null
}
```

Validation error menggunakan `errors` sebagai pengganti `data`. Frontend harus
bercabang berdasarkan HTTP status dan `code`, bukan membandingkan teks message.

Status penting:

- `401`: session tidak ada atau tidak valid; arahkan login/refresh.
- `403`: CSRF atau permission gagal; jangan retry mutation secara otomatis.
- `404`: resource tidak ada atau sengaja disembunyikan oleh ownership check.
- `409`: unique, foreign key, state, atau business conflict.
- `422`: input tidak memenuhi kontrak.
- `429`: rate limit.
- `500/503`: server atau dependency gagal; tampilkan retry-safe error.

## IDs, waktu, dan URL

- Endpoint domain umumnya memakai UUID `publicId`, bukan internal numeric ID.
- CRUD admin dapat memakai numeric ID; composite primary key digabung dengan `~`.
- Database menyimpan waktu pada UTC. Format ke zona pengguna hanya di UI.
- Public card, payment, dan asset URL harus berasal dari response backend.

## Endpoint domain vs CRUD admin

Frontend pengguna harus memakai endpoint domain seperti `/auth`, `/me`,
`/cards`, `/plans`, `/themes`, `/payments`, `/subscriptions`, `/feedback`, dan
`/public/cards`.

`/admin/data` adalah alat super-admin untuk operasi database terkendali. Jangan
memakai generic CRUD sebagai shortcut untuk fitur end-user karena endpoint
domain menerapkan ownership dan aturan bisnis yang lebih kuat.

Referensi request:

- `collection.json`: CRUD administratif generated.
- `qa/postman/KartuNamaDigital-API.postman_collection.json`: kontrak domain.
- `qa/postman/KartuNamaDigital-Local.postman_environment.json`: environment lokal.

## Integration checklist

1. XAMPP MySQL aktif pada port `3306`.
2. Backend health mengembalikan JSON HTTP 200 pada port `3000`.
3. Frontend berjalan pada port `8080`.
4. Browser request memakai `credentials: 'include'`.
5. Origin frontend tercantum persis pada CORS allowlist.
6. Login menghasilkan cookie pada host yang sama.
7. Mutation mengirim CSRF token session terbaru.
8. Frontend menangani 401, 403, 409, 422, dan 503 secara berbeda.
9. `npm run integration:preflight` lulus sebelum debugging UI.
10. Gunakan request ID dari response/log saat melaporkan kegagalan API.
