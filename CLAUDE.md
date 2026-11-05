# Financial Management App

## Konteks
- Aplikasi untuk pencatatan pengeluaran dan pemasukan melalui telegram bot
- User hanya untuk skala kecil 2-5 orang
- Auth = whitelist `users.telegram_id`. Bot abaikan pesan dari telegram_id yang tidak terdaftar. Tidak ada username/password.

## Fitur
1. Pencatatan pengeluaran (CRUD) :
   1. Tanggal (otomatis terisi pada hari pengisian, WIB)
   2. Nama item
   3. Nominal
   4. Sumber dana
   5. Jenis Pengeluaran (harian, bulanan, tahunan)
   6. Catatan
2. Pencatatan pemasukan (CRUD) :
   1. Tanggal (otomatis terisi pada hari pengisian, WIB)
   2. Nama item (gaji, side-job, dll)
   3. Nominal
   4. Sumber dana
   5. Catatan
3. Report Harian (Read) :
   1. Tanggal
   2. Total Pengeluaran
4. Report Bulanan (Read) :
   1. Total Pengeluaran
   2. Total Pemasukan
   3. Item dengan pengeluaran terbesar
   4. Analisa AI (Workers AI, free tier)

## Table Database
Konvensi:
- Semua `created_at` / `updated_at` bertipe `timestamptz default now()`. Postgres simpan UTC, konversi ke `Asia/Jakarta` saat tampil.
- `updated_at` tidak otomatis berubah. Set `updated_at = now()` di setiap query `UPDATE`.

1. users :
   1. id (bigserial)
   2. telegram_id (bigint unique not null)
   3. name (varchar)
   4. created_at (timestamptz)
   5. updated_at (timestamptz)
2. sumber_dana :
   1. id (bigserial)
   2. name (varchar unique not null)
   3. created_at (timestamptz)
   4. updated_at (timestamptz)
3. transactions :
   1. id (bigserial) — dipakai user untuk edit/hapus via chat
   2. date (date not null default `(now() at time zone 'Asia/Jakarta')::date`)
   3. item_name (varchar not null)
   4. amount (bigint not null, rupiah, > 0)
   5. transaction_type (enum `PENGELUARAN` | `PEMASUKAN`)
   6. expense_type (enum `HARIAN` | `BULANAN` | `TAHUNAN`, nullable — wajib hanya untuk `PENGELUARAN`)
   7. sumber_dana_id (FK sumber_dana.id)
   8. note (text, nullable)
   9. created_by (FK users.id)
   10. created_at (timestamptz)
   11. updated_at (timestamptz)
4. v_rekap_sumber (view, granularitas harian) :
   1. Column :
      1. sumber_dana.id
      2. sumber_dana.name
      3. transactions.date
      4. transactions.transaction_type
      5. SUM(transactions.amount) as total
   2. Group by: sumber_dana.id, sumber_dana.name, transactions.date, transactions.transaction_type
   3. Filter (view tidak bisa terima parameter, filter ditulis sebagai `WHERE` saat query) :
      1. sumber_dana.name
      2. date
      3. transaction_type
   4. Pemakaian :
      1. rekap_harian => query view langsung, `WHERE date = ...`
      2. rekap_bulanan => query di atas view, `GROUP BY date_trunc('month', date)`
      3. saldo per sumber dana => `SUM(PEMASUKAN) - SUM(PENGELUARAN)` dari view (saldo tidak disimpan)

## Tech Stack and Deployment
1. Tech Stack :
   1. Language: TypeScript, tanpa framework. Worker `fetch` handler terima webhook Telegram.
   2. Runner/package manager: Bun (`bun install`, `bun run`, `bun test`). Jangan pakai npm/pnpm.
      - Pengecualian: wrangler menolak jalan di runtime Bun ("Wrangler does not support the Bun runtime"). `bun run dev/deploy/types` tetap dipanggil dari Bun, tapi wrangler sendiri jalan di Node (shebang). Jangan tambah `bunfig.toml` `[run] bun = true` atau flag `--bun`.
   3. Telegram: panggil Bot API langsung pakai `fetch`. Tidak pakai library bot.
   4. Database: Neon, akses via `@neondatabase/serverless`.
   5. AI: Workers AI (binding `AI`), model `@cf/meta/llama-3.1-8b-instruct-fp8-fast`. Free 10.000 Neurons/hari, reset 00:00 UTC. Di Free plan kalau kuota habis request error, tidak ditagih. Selalu set `max_tokens`.
2. Deployment: Cloudflare Worker
3. Catatan:
   1. `wrangler dev` tetap pakai kuota Workers AI asli (AI selalu jalan remote).
   2. Secret production (`DATABASE_URL`, `TELEGRAM_WEBHOOK_SECRET`) via `bunx wrangler secret put`. Lokal di `.env` (gitignored), jangan commit.
   3. Bot balas lewat response body webhook (`{"method":"sendMessage",...}`), jadi Worker tidak butuh `TELEGRAM_BOT_TOKEN`. Token hanya dipakai di script `bun run webhook`.
   4. Webhook dicek pakai header `X-Telegram-Bot-Api-Secret-Token`.

## Struktur & Perintah
- `schema.sql` — DDL tabel + view. Apply: `bun run db:schema` (hanya untuk DB kosong, belum ada migration).
- Script di `package.json` yang butuh isi `.env` dibungkus `bun exec '...'`. Di Bun 1.3.6, `bun run` tidak meneruskan `.env` ke command shell biasa, tapi `bun exec` meneruskannya.
- `src/index.ts` — webhook handler + semua command bot.
- `src/parse.ts` — parser input chat (nominal, format transaksi). Test: `bun test`.
- `bun run check` — typecheck. `bun run types` — regenerate `worker-configuration.d.ts` setelah ubah `wrangler.jsonc` / `.env`.
- `bun run webhook` — daftar webhook ke Telegram (butuh `TELEGRAM_BOT_TOKEN`, `WORKER_URL` di `.env`).
- Format command: `/keluar nominal, item, sumber[, jenis][, catatan]`, `/masuk nominal, item, sumber[, catatan]`, `/edit id ...`, `/hapus id`, `/harian [YYYY-MM-DD]`, `/bulanan [YYYY-MM]`, `/sumber [tambah nama]`.
- User didaftarkan manual: `insert into users (telegram_id, name) values (...)`. Telegram ID muncul saat user tak terdaftar chat ke bot.
