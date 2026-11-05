create type transaction_type as enum ('PENGELUARAN', 'PEMASUKAN');
create type expense_type as enum ('HARIAN', 'BULANAN', 'TAHUNAN');

create table users (
  id bigserial primary key,
  telegram_id bigint unique not null,
  name varchar(100) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table sumber_dana (
  id bigserial primary key,
  name varchar(100) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- unique case-insensitive: "BCA" dan "bca" dianggap sama
create unique index sumber_dana_name_key on sumber_dana (lower(name));

create table transactions (
  id bigserial primary key,
  date date not null default (now() at time zone 'Asia/Jakarta')::date,
  item_name varchar(200) not null,
  amount bigint not null check (amount > 0),
  transaction_type transaction_type not null,
  expense_type expense_type,
  sumber_dana_id bigint not null references sumber_dana (id),
  note text,
  created_by bigint not null references users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- expense_type wajib untuk PENGELUARAN, harus null untuk PEMASUKAN
  check ((transaction_type = 'PENGELUARAN') = (expense_type is not null))
);

create view v_rekap_sumber as
select
  s.id as sumber_dana_id,
  s.name as sumber_dana_name,
  t.date,
  t.transaction_type,
  sum(t.amount)::bigint as total
from transactions t
join sumber_dana s on s.id = t.sumber_dana_id
group by s.id, s.name, t.date, t.transaction_type;
