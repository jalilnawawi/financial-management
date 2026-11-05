# Financial Management App

## Konteks
- Aplikasi untuk pencatatan pengeluaran dan pemasukan melalui telegram bot
- User hanya untuk skala kecil 2-5 orang

## Fitur
1. Pencatatan pengeluaran (CRUD) :
   1. Tanggal (otomatis terisi pada hari pengisian)
   2. Nama item
   3. Nominal
   4. Sumber dana
   5. Jenis Pengeluaran (harian, bulanan, tahunan)
   6. Catatan
2. Pencatatan pemasukan (CRUD) :
   1. Tanggal (otomatis terisi pada hari pengisian)
   2. Sumber pemasukan
   3. Nominal
   4. Catatan
3. Report Bulanan (Read) :
   1. Total Pengeluaran
   2. Total Pemasukan
   3. Item dengan pengeluaran terbesar
   4. Analisa AI (opsional pakai API key gratisan)

## Table Database
1. users :
   1. id (uuid)
   2. username
   3. password
   4. name
   5. created_at
   6. updated_at
2. sumber_dana :
   1. id (long/int)
   2. name
   3. amount
   4. created_at
   5. updated_at
3. transactions :
   1. id (uuid)
   2. date
   3. item_name
   4. amount
   5. transaction_type (enum `PENGELUARAN` | `PEMASUKAN`)
   6. sumber_dana_id (FK sumber_dana.id)
   7. created_by (FK users.id)
   8. created_at
   9. updated_at

## Tech Stack and Deployment
1. Tech Stack : 
   1. Language/Framework: `TBD` karena aplikasi skala kecil, dan akses cuma lewat telegram bot
   2. Database: Neon
2. Deployment: Cloudflare Worker 