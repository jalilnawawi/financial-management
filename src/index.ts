import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { parseTx, type TxType } from "./parse";

type Sql = NeonQueryFunction<false, false>;
type Row = Record<string, any>;
type Message = { chat: { id: number }; from?: { id: number }; text?: string };

const AI_MODEL = "@cf/meta/llama-3.1-8b-instruct-fp8-fast";

const HELP = `Perintah:
/keluar nominal, item, sumber[, jenis][, catatan]
  jenis: harian (default) | bulanan | tahunan
  contoh: /keluar 25rb, kopi, BCA
/masuk nominal, item, sumber[, catatan]
  contoh: /masuk 5jt, gaji, BCA
/edit id nominal, item, sumber[, jenis][, catatan]
/hapus id
/harian [YYYY-MM-DD]  transaksi + total hari itu
/bulanan [YYYY-MM]    report bulanan + analisa AI
/sumber               daftar sumber dana + saldo
/sumber tambah nama`;

const rp = (n: number | string) => "Rp" + Number(n).toLocaleString("id-ID");
const notFound = (sumber: string) => `Sumber dana "${sumber}" tidak ada. Tambah dulu: /sumber tambah ${sumber}`;

export default {
  async fetch(req, env): Promise<Response> {
    // Hanya Telegram yang tahu secret ini (di-set saat setWebhook)
    if (req.method !== "POST" || req.headers.get("X-Telegram-Bot-Api-Secret-Token") !== env.TELEGRAM_WEBHOOK_SECRET) {
      return new Response("forbidden", { status: 403 });
    }
    const msg = (await req.json<{ message?: Message }>()).message;
    if (!msg?.text || !msg.from) return new Response("ok");

    const sql = neon(env.DATABASE_URL);
    const [user] = await sql`select id from users where telegram_id = ${msg.from.id}`;
    let text: string;
    if (!user) {
      text = `Kamu belum terdaftar. Telegram ID kamu: ${msg.from.id}`;
    } else {
      try {
        text = await handle(sql, env, user.id, msg.text);
      } catch (e) {
        text = `Error: ${(e as Error).message}`;
      }
    }
    // Balas langsung lewat response webhook, tidak perlu bot token di Worker
    return Response.json({ method: "sendMessage", chat_id: msg.chat.id, text: text.slice(0, 4000) });
  },
} satisfies ExportedHandler<Env>;

async function handle(sql: Sql, env: Env, userId: string, input: string): Promise<string> {
  const [, rawCmd, args] = input.trim().match(/^(\S+)\s*([\s\S]*)$/)!;
  const cmd = rawCmd.split("@")[0].toLowerCase();

  switch (cmd) {
    case "/keluar":
    case "/masuk": {
      const type: TxType = cmd === "/keluar" ? "PENGELUARAN" : "PEMASUKAN";
      const tx = parseTx(args, type);
      if (typeof tx === "string") return tx;
      const [row] = await sql`
        insert into transactions (item_name, amount, transaction_type, expense_type, sumber_dana_id, note, created_by)
        select ${tx.item}, ${tx.amount}, ${type}, ${tx.expenseType}, s.id, ${tx.note}, ${userId}
        from sumber_dana s where lower(s.name) = lower(${tx.sumber})
        returning id`;
      if (!row) return notFound(tx.sumber);
      return `Tercatat #${row.id}: ${type} ${rp(tx.amount)} ${tx.item} (${tx.sumber}${tx.expenseType ? ", " + tx.expenseType : ""})`;
    }

    case "/edit": {
      const m = args.match(/^#?(\d+)\s+([\s\S]+)$/);
      if (!m) return "Format: /edit id nominal, item, sumber[, jenis][, catatan]";
      const [old] = await sql`select transaction_type from transactions where id = ${m[1]}`;
      if (!old) return `Transaksi #${m[1]} tidak ditemukan.`;
      const tx = parseTx(m[2], old.transaction_type);
      if (typeof tx === "string") return tx;
      const [row] = await sql`
        update transactions t set
          item_name = ${tx.item}, amount = ${tx.amount}, expense_type = ${tx.expenseType},
          sumber_dana_id = s.id, note = ${tx.note}, updated_at = now()
        from sumber_dana s
        where t.id = ${m[1]} and lower(s.name) = lower(${tx.sumber})
        returning t.id`;
      if (!row) return notFound(tx.sumber);
      return `Transaksi #${row.id} diupdate: ${rp(tx.amount)} ${tx.item} (${tx.sumber})`;
    }

    case "/hapus": {
      const id = args.replace("#", "");
      if (!/^\d+$/.test(id)) return "Format: /hapus id";
      const [row] = await sql`delete from transactions where id = ${id} returning id, item_name, amount`;
      return row ? `Transaksi #${row.id} dihapus: ${rp(row.amount)} ${row.item_name}` : `Transaksi #${id} tidak ditemukan.`;
    }

    case "/harian": {
      // date null = hari ini (WIB). Format tanggal salah = error dari Postgres.
      const [[{ d }], rows, totals] = (await sql.transaction([
        sql`select coalesce(${args || null}::date, (now() at time zone 'Asia/Jakarta')::date)::text as d`,
        sql`select t.id, t.transaction_type, t.item_name, t.amount, s.name as sumber
            from transactions t join sumber_dana s on s.id = t.sumber_dana_id
            where t.date = coalesce(${args || null}::date, (now() at time zone 'Asia/Jakarta')::date)
            order by t.id`,
        sql`select transaction_type, sum(total)::bigint as total from v_rekap_sumber
            where date = coalesce(${args || null}::date, (now() at time zone 'Asia/Jakarta')::date)
            group by transaction_type`,
      ])) as Row[][];
      if (!rows.length) return `${d}: belum ada transaksi.`;
      const lines = rows.map(
        (r) => `#${r.id} ${r.transaction_type === "PENGELUARAN" ? "-" : "+"}${rp(r.amount)} ${r.item_name} (${r.sumber})`,
      );
      const total = (t: TxType) => rp(totals.find((x) => x.transaction_type === t)?.total ?? 0);
      return `Report ${d}\n${lines.join("\n")}\n\nTotal pengeluaran: ${total("PENGELUARAN")}\nTotal pemasukan: ${total("PEMASUKAN")}`;
    }

    case "/bulanan":
      return monthly(sql, env, args);

    case "/sumber": {
      const tambah = args.match(/^tambah\s+(.+)$/i);
      if (tambah) {
        const [row] = await sql`insert into sumber_dana (name) values (${tambah[1].trim()}) returning name`;
        return `Sumber dana "${row.name}" ditambahkan.`;
      }
      const rows = await sql`
        select s.name, coalesce(sum(case when v.transaction_type = 'PEMASUKAN' then v.total else -v.total end), 0)::bigint as saldo
        from sumber_dana s left join v_rekap_sumber v on v.sumber_dana_id = s.id
        group by s.id, s.name order by s.name`;
      if (!rows.length) return "Belum ada sumber dana. Tambah: /sumber tambah BCA";
      return "Saldo sumber dana:\n" + rows.map((r) => `${r.name}: ${rp(r.saldo)}`).join("\n");
    }

    default:
      return HELP;
  }
}

async function monthly(sql: Sql, env: Env, args: string): Promise<string> {
  // month null = bulan ini (WIB)
  const month = args || null;
  const start = sql`coalesce(to_date(${month}, 'YYYY-MM'), date_trunc('month', now() at time zone 'Asia/Jakarta')::date)`;
  const [[{ m }], totals, perSumber, topItems, perJenis] = (await sql.transaction([
    sql`select to_char(${start}, 'YYYY-MM') as m`,
    sql`select transaction_type, sum(total)::bigint as total from v_rekap_sumber
        where date_trunc('month', date) = ${start} group by transaction_type`,
    sql`select sumber_dana_name, transaction_type, sum(total)::bigint as total from v_rekap_sumber
        where date_trunc('month', date) = ${start} group by 1, 2 order by 1, 2`,
    sql`select item_name, sum(amount)::bigint as total, count(*)::int as n from transactions
        where transaction_type = 'PENGELUARAN' and date_trunc('month', date) = ${start}
        group by item_name order by total desc limit 10`,
    sql`select expense_type, sum(amount)::bigint as total from transactions
        where transaction_type = 'PENGELUARAN' and date_trunc('month', date) = ${start}
        group by expense_type order by total desc`,
  ])) as Row[][];

  if (!totals.length) return `${m}: belum ada transaksi.`;
  const total = (t: TxType) => Number(totals.find((x) => x.transaction_type === t)?.total ?? 0);
  const keluar = total("PENGELUARAN");
  const masuk = total("PEMASUKAN");

  const report = [
    `Report bulan ${m}`,
    `Total pengeluaran: ${rp(keluar)}`,
    `Total pemasukan: ${rp(masuk)}`,
    `Selisih: ${rp(masuk - keluar)}`,
    topItems[0] ? `Pengeluaran terbesar: ${topItems[0].item_name} ${rp(topItems[0].total)} (${topItems[0].n}x)` : "",
    "",
    "Per jenis pengeluaran:",
    ...perJenis.map((r) => `- ${r.expense_type}: ${rp(r.total)}`),
    "",
    "Per sumber dana:",
    ...perSumber.map((r) => `- ${r.sumber_dana_name} ${r.transaction_type}: ${rp(r.total)}`),
    "",
    "Top 10 item pengeluaran:",
    ...topItems.map((r, i) => `${i + 1}. ${r.item_name}: ${rp(r.total)} (${r.n}x)`),
  ].join("\n");

  let analisa: string;
  try {
    const res = (await env.AI.run(AI_MODEL, {
      messages: [
        {
          role: "system",
          content:
            "Kamu analis keuangan rumah tangga. Jawab dalam Bahasa Indonesia, singkat, maksimal 5 poin. Fokus pada pola pengeluaran dan saran hemat yang konkret.",
        },
        { role: "user", content: report },
      ],
      max_tokens: 400,
    })) as { response?: string };
    analisa = res.response?.trim() || "(analisa AI kosong)";
  } catch (e) {
    // Kuota harian Workers AI habis atau error lain: report tetap terkirim
    analisa = `(analisa AI gagal: ${(e as Error).message})`;
  }
  return `${report}\n\nAnalisa AI:\n${analisa}`;
}
