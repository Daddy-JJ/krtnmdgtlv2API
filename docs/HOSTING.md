# Production Hosting Baseline

Dokumen ini mencatat baseline production setelah migrasi shared hosting pada
19 September 2026. Domain, URL API, application root, startup file, dan susunan
folder hosting tidak berubah.

## Identitas hosting

| Item | Nilai |
| --- | --- |
| Hosting package | `nimbus_plus` |
| Server name | `sierra` |
| cPanel | `138.0 (build 7)` |
| Apache | `2.4.68` |
| Database | `11.4.13-MariaDB-cll-lve-log` |
| Architecture | `x86_64` |
| Operating system | Linux |
| Kernel | `6.12.0-211.49.1.el10_2.x86_64` |
| Shared IP | `202.155.137.45` |
| Sendmail | `/usr/sbin/sendmail` |
| Perl | `/usr/bin/perl` / `5.40.2` |
| Python | `3.12.14` |
| Node.js | `24.21.0` |

Shared IP adalah inventaris infrastruktur, bukan nilai konfigurasi aplikasi.
DNS dan domain tetap menjadi authority untuk koneksi publik.

## Konfigurasi Node.js production

```text
Application mode         : Production
Application URL          : https://api.kartunamadigital.id
Application root         : /home/karj9582/repositories/krtnmdgtlv2API-clean
Application startup file : app.js
Node.js runtime          : 24.21.0
```

Perintah aktivasi environment yang ditampilkan cPanel:

```bash
source /home/karj9582/nodevenv/repositories/krtnmdgtlv2API-clean/24/bin/activate
cd /home/karj9582/repositories/krtnmdgtlv2API-clean
```

`app.js` adalah CommonJS bridge untuk LiteSpeed/Passenger. Source aplikasi
tetap berada di `src/server.ts`; jangan memindahkan business logic ke adapter.

## Deployment dan restart

Repository hosting adalah salinan deployment, bukan source of truth. Alur aman:

1. Commit dan push hanya dari project canonical lokal.
2. Jalankan **Update from Remote** pada cPanel Git Version Control.
3. Pastikan branch `main` bersih dan HEAD sesuai GitHub.
4. Jalankan install dependency hanya jika `package-lock.json` berubah.
5. Jalankan migration status secara read-only sebelum migration baru.
6. Restart aplikasi dari cPanel Setup Node.js App.
7. Verifikasi `GET https://api.kartunamadigital.id/api/v1/health`.

Fitur **Deploy HEAD Commit** milik cPanel membutuhkan `.cpanel.yml`. Project ini
saat ini berjalan langsung dari application root repository, sehingga workflow
kanonis adalah **Update from Remote + Restart App**. Jangan menambahkan
`.cpanel.yml` tanpa target deployment yang terpisah dan review perlindungan
untuk `.env`, JWT key, storage, serta upload user.

## Preflight

Setelah environment Node.js diaktifkan:

```bash
node -v
npm -v
npm run hosting:preflight
node --unhandled-rejections=warn scripts/migrate.ts status
```

`hosting:preflight` mengharuskan runtime production Node.js `>=24.21 <25`, key
JWT terbaca, storage writable, HTTPS dan secure cookie aktif, serta konfigurasi
database/HMAC tersedia tanpa menampilkan nilainya.

Jangan menyalin `.env`, password database, SMTP credential, JWT private key,
token, cookie, atau dump data production ke Git.
