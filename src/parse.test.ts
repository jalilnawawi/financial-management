import { expect, test } from "bun:test";
import { parseAmount, parseTx } from "./parse";

test("parseAmount", () => {
  expect(parseAmount("25000")).toBe(25000);
  expect(parseAmount("25.000")).toBe(25000);
  expect(parseAmount("1.500.000")).toBe(1500000);
  expect(parseAmount("25rb")).toBe(25000);
  expect(parseAmount("25k")).toBe(25000);
  expect(parseAmount("1.5jt")).toBe(1500000);
  expect(parseAmount("1,5jt")).toBe(1500000);
  expect(parseAmount("0")).toBeNull();
  expect(parseAmount("abc")).toBeNull();
  expect(parseAmount("-5")).toBeNull();
});

test("parseTx pengeluaran", () => {
  expect(parseTx("25rb, kopi, BCA", "PENGELUARAN")).toEqual({
    amount: 25000, item: "kopi", sumber: "BCA", expenseType: "HARIAN", note: null,
  });
  expect(parseTx("150rb, internet, BCA, Bulanan, bayar indihome, telat", "PENGELUARAN")).toEqual({
    amount: 150000, item: "internet", sumber: "BCA", expenseType: "BULANAN", note: "bayar indihome, telat",
  });
  expect(parseTx("25rb, kopi, BCA, enak", "PENGELUARAN")).toMatchObject({ expenseType: "HARIAN", note: "enak" });
});

test("parseTx pemasukan", () => {
  expect(parseTx("5jt, gaji, BCA, harian", "PEMASUKAN")).toEqual({
    amount: 5000000, item: "gaji", sumber: "BCA", expenseType: null, note: "harian",
  });
});

test("parseTx error", () => {
  expect(typeof parseTx("25rb, kopi", "PENGELUARAN")).toBe("string");
  expect(typeof parseTx("xx, kopi, BCA", "PENGELUARAN")).toBe("string");
});
