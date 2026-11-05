export type TxType = "PENGELUARAN" | "PEMASUKAN";
export type ExpenseType = "HARIAN" | "BULANAN" | "TAHUNAN";

export type TxInput = {
  amount: number;
  item: string;
  sumber: string;
  expenseType: ExpenseType | null;
  note: string | null;
};

const JENIS: Record<string, ExpenseType> = { harian: "HARIAN", bulanan: "BULANAN", tahunan: "TAHUNAN" };

// "25000", "25.000" -> 25000. Suffix rb/k/jt: titik/koma jadi desimal, "1.5jt" / "1,5jt" -> 1500000.
export function parseAmount(s: string): number | null {
  const m = s.trim().toLowerCase().match(/^(\d+(?:[.,]\d+)*)\s*(rb|k|jt)?$/);
  if (!m) return null;
  const n = m[2] ? Number(m[1].replace(",", ".")) * (m[2] === "jt" ? 1e6 : 1e3) : Number(m[1].replace(/[.,]/g, ""));
  const v = Math.round(n);
  return Number.isSafeInteger(v) && v > 0 ? v : null;
}

// Format: nominal, item, sumber[, jenis][, catatan]
// jenis hanya untuk PENGELUARAN, default HARIAN. Sisa field digabung jadi catatan.
export function parseTx(args: string, type: TxType): TxInput | string {
  const f = args.split(",").map((s) => s.trim());
  if (f.length < 3 || !f[1] || !f[2]) return "Format: nominal, item, sumber[, jenis][, catatan]";
  const amount = parseAmount(f[0]);
  if (amount === null) return `Nominal "${f[0]}" tidak valid. Contoh: 25000, 25.000, 25rb, 1.5jt`;
  let rest = f.slice(3);
  let expenseType: ExpenseType | null = null;
  if (type === "PENGELUARAN") {
    expenseType = JENIS[rest[0]?.toLowerCase() ?? ""] ?? "HARIAN";
    if (rest[0] && JENIS[rest[0].toLowerCase()]) rest = rest.slice(1);
  }
  return { amount, item: f[1], sumber: f[2], expenseType, note: rest.join(", ") || null };
}
